import multer from 'multer';
import { Request } from 'express';
import { config } from '../config';
import logger from '../utils/logger';
import path from 'path';
import fs from 'fs-extra';

// Ensure upload directory exists
fs.ensureDirSync(config.uploadDir);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const fileId = req.body.fileId;
        if (!fileId) {
            return cb(new Error('File ID is required'), '');
        }
        const chunkDir = path.join(config.uploadDir, fileId);
        fs.ensureDirSync(chunkDir);
        cb(null, chunkDir);
    },
    filename: function (req, file, cb) {
        const chunkIndex = req.body.chunkIndex;
        cb(null, `chunk-${chunkIndex}`);
    },
});

const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    // For chunk uploads, we're more permissive since we've already validated the file type
    // during the initial upload. We just need to ensure it's a binary file.
    if (
        file.mimetype.startsWith('application/') ||
        file.mimetype.startsWith('image/') ||
        file.mimetype.startsWith('video/') ||
        file.mimetype === ''
    ) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only binary files are allowed.'));
    }
};

// Add 10% overhead to the chunk size limit to accommodate form data
const CHUNK_SIZE_WITH_OVERHEAD = Math.ceil(config.chunkSize * 1.1);

// For base64 data, we need a larger field size limit (base64 encoding increases size by ~33%)
const BASE64_CHUNK_SIZE_WITH_OVERHEAD = Math.ceil(config.chunkSize * 1.5);

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: CHUNK_SIZE_WITH_OVERHEAD,
        fieldSize: BASE64_CHUNK_SIZE_WITH_OVERHEAD, // Increase field size limit for base64 data
    },
});

export const errorHandler = (
    error: Error,
    req: Request,
    res: any,
    next: any
) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: `File size exceeds the ${
                    CHUNK_SIZE_WITH_OVERHEAD / 1024 / 1024
                }MB limit`,
            });
        }
        if (error.code === 'LIMIT_FIELD_VALUE') {
            return res.status(400).json({
                error: `Field value too long. This might be due to base64 encoding. Please try a smaller chunk size.`,
            });
        }
        logger.error('Multer error:', error);
        return res.status(400).json({ error: error.message });
    }

    if (error) {
        logger.error('Upload error:', error);
        return res.status(400).json({ error: error.message });
    }

    next();
};

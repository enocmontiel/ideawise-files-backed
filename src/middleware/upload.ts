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
    const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'video/mp4',
        'video/webm',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: config.chunkSize,
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
                    config.chunkSize / 1024 / 1024
                }MB limit`,
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

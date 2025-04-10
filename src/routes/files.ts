import express from 'express';
import { filesController } from '../controllers/files';
import multer from 'multer';
import { config } from '../config';
import path from 'path';
import fs from 'fs-extra';
import logger from '../utils/logger';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            const deviceId = req.headers['x-device-id'] as string;
            if (!deviceId) {
                logger.error('No device ID provided in headers');
                return cb(new Error('Device ID is required'), '');
            }

            // Create device-specific directory
            const deviceUploadDir = path.join(config.uploadDir, deviceId);

            // Ensure directory exists synchronously
            if (!fs.existsSync(deviceUploadDir)) {
                fs.mkdirSync(deviceUploadDir, { recursive: true });
                logger.info(
                    `Created device upload directory: ${deviceUploadDir}`
                );
            }

            // Create thumbnails directory
            const thumbnailsDir = path.join(deviceUploadDir, 'thumbnails');
            if (!fs.existsSync(thumbnailsDir)) {
                fs.mkdirSync(thumbnailsDir, { recursive: true });
                logger.info(`Created thumbnails directory: ${thumbnailsDir}`);
            }

            logger.info(`Using upload directory: ${deviceUploadDir}`);
            cb(null, deviceUploadDir);
        } catch (error) {
            logger.error('Error setting upload destination:', error);
            cb(error as Error, '');
        }
    },
    filename: (req, file, cb) => {
        try {
            const deviceId = req.headers['x-device-id'] as string;
            // Generate unique filename with device ID and timestamp
            const timestamp = Date.now();
            const uniqueSuffix = `${timestamp}-${Math.round(
                Math.random() * 1e9
            )}`;
            const filename = `${file.originalname}-${uniqueSuffix}`;

            logger.info(
                `Generated filename: ${filename} for device: ${deviceId}`
            );
            cb(null, filename);
        } catch (error) {
            logger.error('Error generating filename:', error);
            cb(error as Error, '');
        }
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        try {
            // Accept images and videos only
            if (
                file.mimetype.startsWith('image/') ||
                file.mimetype.startsWith('video/')
            ) {
                logger.info(`Accepted file type: ${file.mimetype}`);
                cb(null, true);
            } else {
                logger.warn(`Rejected file type: ${file.mimetype}`);
                cb(
                    new Error(
                        'Invalid file type. Only images and videos are allowed.'
                    )
                );
            }
        } catch (error) {
            logger.error('Error in file filter:', error);
            cb(error as Error);
        }
    },
});

// Middleware to validate device ID
const validateDeviceId = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) => {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) {
        logger.warn('Missing device ID in request');
        return res.status(400).json({ error: 'Device ID is required' });
    }
    next();
};

// Device-specific routes (mounted under /api in index.ts)
router.use(validateDeviceId);
router.get('/files/device/:deviceId', filesController.listDeviceFiles);
router.post('/files', upload.single('file'), filesController.uploadFile);
router.delete('/files/:id', filesController.deleteFile);

export default router;

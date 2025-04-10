import rateLimit from 'express-rate-limit';
import { config } from '../config';
import logger from '../utils/logger';

// General rate limit for non-chunk endpoints
export const uploadRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', {
            ip: req.ip,
            path: req.path,
        });
        res.status(429).json({
            error: 'Too many requests, please try again later.',
        });
    },
    keyGenerator: (req) => {
        // Use device ID as the rate limit key if available
        return (req.headers['x-device-id'] as string) || req.ip || 'unknown';
    },
});

// Separate rate limit for chunk uploads with higher limits
export const chunkUploadRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // Allow 1000 requests per minute for chunks
    message: {
        error: 'Too many chunk upload requests, please try again later.',
    },
    handler: (req, res) => {
        logger.warn('Chunk upload rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            deviceId: req.headers['x-device-id'],
        });
        res.status(429).json({
            error: 'Too many chunk upload requests, please try again later.',
        });
    },
    keyGenerator: (req) => {
        // Use combination of device ID and file ID for more granular control
        const deviceId = req.headers['x-device-id'] as string;
        const fileId = req.body.fileId || req.query.fileId;
        return `${deviceId}_${fileId}` || req.ip || 'unknown';
    },
});

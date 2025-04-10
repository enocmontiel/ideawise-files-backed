import rateLimit from 'express-rate-limit';
import { config } from '../config';
import logger from '../utils/logger';

// Separate rate limits for different endpoints
export const uploadRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Allow 100 requests per minute for chunks
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

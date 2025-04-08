import rateLimit from 'express-rate-limit';
import { config } from '../config';
import logger from '../utils/logger';

export const uploadRateLimit = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
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
});

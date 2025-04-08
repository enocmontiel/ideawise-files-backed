import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    uploadDir: path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    chunkSize: parseInt(process.env.CHUNK_SIZE || '1048576', 10),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10),
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10),
    },
} as const;

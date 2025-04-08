import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { redisService } from './services/redis';
import { fileService } from './services/file';
import uploadRoutes from './routes/upload';
import logger from './utils/logger';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Base health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        version: '1.0.0',
        serverTime: new Date().toISOString(),
        environment: config.nodeEnv,
        endpoints: {
            upload: '/api/upload',
            files: '/api/files',
            health: '/',
        },
    });
});

// Static file serving
app.use('/files', express.static(path.join(config.uploadDir)));

// Routes
app.use('/api', uploadRoutes);

// Error handling
app.use(
    (
        err: Error,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) => {
        logger.error('Unhandled error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
);

// Start server
const startServer = async () => {
    try {
        // Ensure upload directory exists
        await fileService.ensureUploadDir();

        // Connect to Redis
        await redisService.connect();

        // Start listening
        app.listen(config.port, () => {
            logger.info(`Server is running on port ${config.port}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    await redisService.disconnect();
    process.exit(0);
});

startServer();

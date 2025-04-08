import { Request, Response } from 'express';
import { fileService } from '../services/file';
import { redisService } from '../services/redis';
import logger from '../utils/logger';
import { config } from '../config';
import {
    InitiateUploadResponse,
    UploadChunk,
    UploadProgress,
} from '../types/api';

export const uploadController = {
    async initiateUpload(req: Request, res: Response) {
        try {
            const { fileName, fileSize, mimeType } = req.body;

            if (!fileName || !fileSize || !mimeType) {
                return res
                    .status(400)
                    .json({ error: 'Missing required fields' });
            }

            if (fileSize > config.maxFileSize) {
                return res
                    .status(400)
                    .json({ error: 'File size exceeds limit' });
            }

            const fileId = fileService.generateFileId();
            const totalChunks = Math.ceil(fileSize / config.chunkSize);

            const response: InitiateUploadResponse = {
                fileId,
                uploadUrl: `/api/upload/chunk`,
                chunks: totalChunks,
                chunkSize: config.chunkSize,
            };

            await redisService.setUploadProgress(fileId, {
                fileId,
                progress: 0,
                status: 'pending',
                totalChunks,
            });

            logger.info(`Upload initiated for file: ${fileName}`, {
                fileId,
                totalChunks,
            });
            res.json(response);
        } catch (error) {
            logger.error('Error initiating upload:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async uploadChunk(req: Request, res: Response) {
        try {
            const { fileId, chunkIndex, totalChunks } = req.body;
            const chunk = req.file;

            if (!fileId || !chunk || chunkIndex === undefined || !totalChunks) {
                return res
                    .status(400)
                    .json({ error: 'Missing required fields' });
            }

            logger.info(`Received chunk for file: ${fileId}`, {
                chunkIndex,
                chunkSize: chunk.size,
                path: chunk.path,
            });

            const uploadChunk: UploadChunk = {
                fileId,
                chunkIndex: parseInt(chunkIndex),
                totalChunks: parseInt(totalChunks),
                data: chunk.path,
                size: chunk.size,
            };

            await fileService.saveChunk(uploadChunk);
            await redisService.setChunkStatus(
                fileId,
                uploadChunk.chunkIndex,
                true
            );

            const progress = await redisService.getAllChunkStatuses(
                fileId,
                totalChunks
            );
            const completedChunks = progress.filter(Boolean).length;
            const uploadProgress = (completedChunks / totalChunks) * 100;

            await redisService.setUploadProgress(fileId, {
                fileId,
                progress: uploadProgress,
                status: 'uploading',
                totalChunks,
            });

            logger.info(`Chunk uploaded for file: ${fileId}`, {
                chunkIndex,
                progress: uploadProgress,
            });

            res.status(200).json({ success: true });
        } catch (error) {
            logger.error('Error uploading chunk:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async finalizeUpload(req: Request, res: Response) {
        try {
            const { fileId, fileName } = req.body;

            if (!fileId || !fileName) {
                return res
                    .status(400)
                    .json({ error: 'Missing required fields' });
            }

            const progress = await redisService.getUploadProgress(fileId);
            if (!progress) {
                return res.status(404).json({ error: 'Upload not found' });
            }

            const fileMetadata = await fileService.assembleFile(
                fileId,
                fileName,
                progress.totalChunks
            );
            await redisService.deleteUploadProgress(fileId);

            logger.info(`Upload finalized for file: ${fileName}`, { fileId });
            res.json(fileMetadata);
        } catch (error) {
            logger.error('Error finalizing upload:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getUploadStatus(req: Request, res: Response) {
        try {
            const { fileId } = req.params;

            if (!fileId) {
                return res.status(400).json({ error: 'Missing fileId' });
            }

            const progress = await redisService.getUploadProgress(fileId);
            if (!progress) {
                return res.status(404).json({ error: 'Upload not found' });
            }

            res.json(progress);
        } catch (error) {
            logger.error('Error getting upload status:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async cancelUpload(req: Request, res: Response) {
        try {
            const { fileId } = req.body;

            if (!fileId) {
                return res.status(400).json({ error: 'Missing fileId' });
            }

            await redisService.deleteUploadProgress(fileId);
            await fileService.deleteFile(fileId);

            logger.info(`Upload cancelled for file: ${fileId}`);
            res.json({ success: true });
        } catch (error) {
            logger.error('Error cancelling upload:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
};

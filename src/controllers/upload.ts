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
import path from 'path';
import fs from 'fs-extra';

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
            const { fileId, chunkIndex, totalChunks, chunk, isBase64 } =
                req.body;
            const uploadedFile = req.file;

            if (!fileId || chunkIndex === undefined || !totalChunks) {
                return res
                    .status(400)
                    .json({ error: 'Missing required fields' });
            }

            // Check if we have either a file upload or base64 data
            if (!uploadedFile && !chunk) {
                return res.status(400).json({ error: 'Missing chunk data' });
            }

            let chunkPath: string;
            let chunkSize: number;

            if (isBase64 && chunk) {
                // Handle base64 data
                const buffer = Buffer.from(chunk, 'base64');
                chunkSize = buffer.length;

                // Save the base64 data to a temporary file
                const chunkDir = path.join(config.uploadDir, fileId);
                fs.ensureDirSync(chunkDir);
                chunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);
                fs.writeFileSync(chunkPath, buffer);

                logger.info(`Received base64 chunk for file: ${fileId}`, {
                    chunkIndex,
                    chunkSize,
                    path: chunkPath,
                });
            } else if (uploadedFile) {
                // Handle file upload
                chunkPath = uploadedFile.path;
                chunkSize = uploadedFile.size;

                logger.info(`Received file chunk for file: ${fileId}`, {
                    chunkIndex,
                    chunkSize,
                    path: chunkPath,
                });
            } else {
                return res
                    .status(400)
                    .json({ error: 'Invalid chunk data format' });
            }

            const uploadChunk: UploadChunk = {
                fileId,
                chunkIndex: parseInt(chunkIndex),
                totalChunks: parseInt(totalChunks),
                data: chunkPath,
                size: chunkSize,
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

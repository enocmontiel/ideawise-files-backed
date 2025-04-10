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
            const { fileName, fileSize, mimeType, deviceId } = req.body;

            if (!fileName || !fileSize || !mimeType || !deviceId) {
                return res
                    .status(400)
                    .json({
                        error: 'Missing required fields. fileName, fileSize, mimeType, and deviceId are required.',
                    });
            }

            if (fileSize > config.maxFileSize) {
                return res
                    .status(400)
                    .json({ error: 'File size exceeds limit' });
            }

            // Validate deviceId format (assuming UUID format)
            if (
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    deviceId
                )
            ) {
                return res
                    .status(400)
                    .json({
                        error: 'Invalid deviceId format. Must be a valid UUID.',
                    });
            }

            const fileId = fileService.generateFileId();
            const totalChunks = Math.ceil(fileSize / config.chunkSize);

            const response: InitiateUploadResponse = {
                fileId,
                uploadUrl: `/api/upload/chunk`,
                chunks: totalChunks,
                chunkSize: config.chunkSize,
                deviceId: deviceId,
            };

            await redisService.setUploadProgress(fileId, {
                fileId,
                progress: 0,
                status: 'pending',
                totalChunks,
                deviceId: deviceId,
            });

            logger.info(`Upload initiated for file: ${fileName}`, {
                fileId,
                totalChunks,
                deviceId: deviceId,
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

            // Get the existing upload progress to preserve deviceId
            const existingProgress = await redisService.getUploadProgress(
                fileId
            );
            if (!existingProgress) {
                return res.status(404).json({ error: 'Upload not found' });
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

                // Save the base64 data to a temporary file in the temp directory
                const tempDir = path.join(config.uploadDir, 'temp', fileId);
                await fs.ensureDir(tempDir);
                chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
                await fs.writeFile(chunkPath, buffer);

                logger.info(`Received base64 chunk for file: ${fileId}`, {
                    chunkIndex,
                    chunkSize,
                    path: chunkPath,
                });
            } else if (uploadedFile) {
                // Handle file upload - move to temp directory
                const tempDir = path.join(config.uploadDir, 'temp', fileId);
                await fs.ensureDir(tempDir);
                chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
                await fs.move(uploadedFile.path, chunkPath, {
                    overwrite: true,
                });
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

            // Update progress while preserving deviceId
            await redisService.setUploadProgress(fileId, {
                ...existingProgress,
                progress: uploadProgress,
                status: 'uploading',
                totalChunks,
            });

            logger.info(`Chunk uploaded for file: ${fileId}`, {
                chunkIndex,
                progress: uploadProgress,
                deviceId: existingProgress.deviceId,
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

            // Use the deviceId that was stored during initiation
            const fileMetadata = await fileService.assembleFile(
                fileId,
                fileName,
                progress.totalChunks,
                progress.deviceId
            );
            await redisService.deleteUploadProgress(fileId);

            logger.info(`Upload finalized for file: ${fileName}`, {
                fileId,
                deviceId: progress.deviceId,
            });
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
            const { fileId, deviceId } = req.body;

            if (!fileId) {
                return res.status(400).json({ error: 'Missing fileId' });
            }

            await redisService.deleteUploadProgress(fileId);

            // Clean up temp chunks
            const tempDir = path.join(config.uploadDir, 'temp', fileId);
            await fs.remove(tempDir);

            // If deviceId is provided, also clean up the device directory
            if (deviceId) {
                await fileService.deleteFile(deviceId, fileId);
            }

            logger.info(`Upload cancelled for file: ${fileId}`, { deviceId });
            res.json({ success: true });
        } catch (error) {
            logger.error('Error cancelling upload:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
};

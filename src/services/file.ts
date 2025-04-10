import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { config } from '../config';
import logger from '../utils/logger';
import { FileMetadata, UploadChunk } from '../types/api';

export const fileService = {
    async ensureUploadDir() {
        await fs.ensureDir(config.uploadDir);
    },

    async ensureFileDirectories(deviceId: string, fileId: string) {
        if (!deviceId || deviceId === 'default-device') {
            throw new Error('Invalid deviceId provided');
        }

        const devicePath = path.join(config.uploadDir, deviceId);
        const filePath = path.join(devicePath, fileId);
        const originalPath = path.join(filePath, 'original');
        const thumbnailPath = path.join(filePath, 'thumbnail');

        await Promise.all([
            fs.ensureDir(originalPath),
            fs.ensureDir(thumbnailPath),
        ]);

        return {
            devicePath,
            filePath,
            originalPath,
            thumbnailPath,
        };
    },

    async saveChunk(chunk: UploadChunk) {
        const chunkDir = path.join(config.uploadDir, 'temp', chunk.fileId);
        await fs.ensureDir(chunkDir);
        const chunkPath = path.join(chunkDir, `chunk-${chunk.chunkIndex}`);

        if (Buffer.isBuffer(chunk.data)) {
            await fs.writeFile(chunkPath, chunk.data);
        } else if (typeof chunk.data === 'string') {
            if (chunk.data !== chunkPath) {
                await fs.copy(chunk.data, chunkPath);
                await fs.remove(chunk.data).catch((err) => {
                    logger.warn(
                        `Failed to remove temporary file: ${chunk.data}`,
                        err
                    );
                });
            }
        } else {
            throw new Error('Invalid chunk data type');
        }
    },

    async generateThumbnail(
        originalFilePath: string,
        thumbnailDir: string,
        fileName: string,
        deviceId: string,
        fileId: string
    ): Promise<string | undefined> {
        try {
            const mimeType = this.getMimeType(fileName);
            if (!mimeType.startsWith('image/')) {
                return undefined;
            }

            const thumbnailPath = path.join(thumbnailDir, fileName);

            await sharp(originalFilePath)
                .resize(200, 200, {
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .toFile(thumbnailPath);

            // Return URL in the same format as original files
            return `/files/${deviceId}/${fileId}/thumbnail/${fileName}`;
        } catch (error) {
            logger.error('Error generating thumbnail:', error);
            return undefined;
        }
    },

    async assembleFile(
        fileId: string,
        fileName: string,
        totalChunks: number,
        deviceId: string
    ): Promise<FileMetadata> {
        if (!deviceId || deviceId === 'default-device') {
            throw new Error('Invalid deviceId provided');
        }

        const tempChunkDir = path.join(config.uploadDir, 'temp', fileId);

        // Create the directory structure
        const { originalPath, thumbnailPath } =
            await this.ensureFileDirectories(deviceId, fileId);

        // Include the file ID in the filename
        const fileExt = path.extname(fileName);
        const fileNameWithoutExt = path.basename(fileName, fileExt);
        const newFileName = `${fileNameWithoutExt}-${fileId}${fileExt}`;
        const finalFilePath = path.join(originalPath, newFileName);

        const writeStream = fs.createWriteStream(finalFilePath);

        try {
            // Write each chunk in order
            for (let i = 0; i < totalChunks; i++) {
                const chunkPath = path.join(tempChunkDir, `chunk-${i}`);
                if (!(await fs.pathExists(chunkPath))) {
                    throw new Error(`Chunk ${i} is missing`);
                }
                const chunkData = await fs.readFile(chunkPath);
                writeStream.write(chunkData);
            }

            writeStream.end();

            // Wait for the write to complete
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            const stats = await fs.stat(finalFilePath);
            const mimeType = this.getMimeType(fileName);

            // Generate thumbnail for images
            const thumbnailUrl = await this.generateThumbnail(
                finalFilePath,
                thumbnailPath,
                newFileName,
                deviceId,
                fileId
            );

            // Create file metadata
            const fileMetadata: FileMetadata = {
                id: fileId,
                name: fileName,
                type: path.extname(fileName),
                size: stats.size,
                mimeType,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                url: `/files/${deviceId}/${fileId}/original/${newFileName}`,
                thumbnailUrl,
                deviceId,
            };

            // Clean up temporary chunks
            await fs.remove(tempChunkDir);

            return fileMetadata;
        } catch (error) {
            // Clean up on error
            await fs.remove(finalFilePath).catch(() => {});
            throw error;
        }
    },

    async deleteFile(deviceId: string, fileId: string) {
        const filePath = path.join(config.uploadDir, deviceId, fileId);
        await fs.remove(filePath);
    },

    getMimeType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
        };
        return mimeTypes[ext] || 'application/octet-stream';
    },

    generateFileId(): string {
        return uuidv4();
    },
};

import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import logger from '../utils/logger';
import { FileMetadata, UploadChunk } from '../types/api';

export const fileService = {
    async ensureUploadDir() {
        await fs.ensureDir(config.uploadDir);
    },

    async saveChunk(chunk: UploadChunk) {
        const chunkDir = path.join(config.uploadDir, chunk.fileId);
        await fs.ensureDir(chunkDir);
        const chunkPath = path.join(chunkDir, `chunk-${chunk.chunkIndex}`);

        // If the chunk is a Buffer, write it directly
        if (Buffer.isBuffer(chunk.data)) {
            await fs.writeFile(chunkPath, chunk.data);
        } else if (typeof chunk.data === 'string') {
            // If it's a file path and it's different from the target path, copy it
            if (chunk.data !== chunkPath) {
                await fs.copy(chunk.data, chunkPath);
                // Remove the temporary file
                await fs.remove(chunk.data).catch((err) => {
                    logger.warn(
                        `Failed to remove temporary file: ${chunk.data}`,
                        err
                    );
                });
            }
            // If the paths are the same, the file is already in the correct location
        } else {
            throw new Error('Invalid chunk data type');
        }
    },

    async assembleFile(
        fileId: string,
        fileName: string,
        totalChunks: number
    ): Promise<FileMetadata> {
        const chunkDir = path.join(config.uploadDir, fileId);
        const filePath = path.join(config.uploadDir, fileName);

        // Create a write stream for the final file
        const writeStream = fs.createWriteStream(filePath);

        try {
            // Write each chunk in order
            for (let i = 0; i < totalChunks; i++) {
                const chunkPath = path.join(chunkDir, `chunk-${i}`);

                // Check if chunk exists
                if (!(await fs.pathExists(chunkPath))) {
                    throw new Error(`Chunk ${i} is missing`);
                }

                const chunkData = await fs.readFile(chunkPath);
                writeStream.write(chunkData);
            }

            // End the write stream
            writeStream.end();

            // Wait for the write to complete
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            // Get file stats
            const stats = await fs.stat(filePath);

            // Get MIME type
            const mimeType = this.getMimeType(fileName);

            // Create file metadata
            const fileMetadata: FileMetadata = {
                id: fileId,
                name: fileName,
                type: path.extname(fileName),
                size: stats.size,
                mimeType,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                url: `/files/${fileName}`,
                thumbnailUrl: mimeType.startsWith('image/')
                    ? `/files/${fileName}`
                    : undefined,
            };

            // Clean up chunks
            await fs.remove(chunkDir);

            return fileMetadata;
        } catch (error) {
            // Clean up on error
            await fs.remove(filePath).catch(() => {});
            throw error;
        }
    },

    async deleteFile(fileId: string) {
        const filePath = path.join(config.uploadDir, fileId);
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

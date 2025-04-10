import { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';
import logger from '../utils/logger';
import { getMimeType } from '../utils/mime';

export const filesController = {
    listDeviceFiles: async (req: Request, res: Response) => {
        try {
            const { deviceId } = req.params;
            const headerDeviceId = req.headers['x-device-id'] as string;

            if (!deviceId || !headerDeviceId) {
                logger.warn('Missing device ID');
                return res.status(400).json({ error: 'Device ID is required' });
            }

            // Ensure the device ID in the URL matches the one in headers
            if (deviceId !== headerDeviceId) {
                logger.warn('Device ID mismatch between URL and headers');
                return res.status(403).json({ error: 'Invalid device ID' });
            }

            const deviceUploadDir = path.join(config.uploadDir, deviceId);
            logger.info(
                `Listing files from device directory: ${deviceUploadDir}`
            );

            // Create directory if it doesn't exist
            await fs.ensureDir(deviceUploadDir);

            const files = await fs.readdir(deviceUploadDir);
            logger.info(
                `Found ${files.length} files in directory: ${files.join(', ')}`
            );

            const fileMetadata = await Promise.all(
                files
                    .filter(
                        (filename) =>
                            !filename.startsWith('.') &&
                            !filename.startsWith('thumbnails')
                    )
                    .map(async (filename) => {
                        const filePath = path.join(deviceUploadDir, filename);
                        const stats = await fs.stat(filePath);
                        const ext = path.extname(filename);

                        return {
                            id: filename.replace(ext, ''),
                            name: filename,
                            size: stats.size,
                            type: ext,
                            mimeType: getMimeType(filename),
                            createdAt: stats.birthtime.toISOString(),
                            updatedAt: stats.mtime.toISOString(),
                            url: `/files/${deviceId}/${filename}`,
                            thumbnailUrl: ext.match(/\.(jpg|jpeg|png|gif)$/i)
                                ? `/files/${deviceId}/thumbnails/${filename}`
                                : undefined,
                        };
                    })
            );

            logger.info(
                `Returning ${fileMetadata.length} files for device ${deviceId}`
            );
            return res.status(200).json(fileMetadata);
        } catch (error) {
            logger.error('Error listing device files:', error);
            return res.status(500).json({ error: 'Failed to list files' });
        }
    },

    uploadFile: async (req: Request, res: Response) => {
        try {
            const deviceId = req.headers['x-device-id'] as string;
            const file = req.file;

            if (!deviceId) {
                logger.warn('No device ID provided');
                return res.status(400).json({ error: 'Device ID is required' });
            }

            if (!file) {
                logger.warn('No file uploaded');
                return res.status(400).json({ error: 'No file uploaded' });
            }

            // Ensure file is in the correct device directory
            const deviceUploadDir = path.join(config.uploadDir, deviceId);
            const currentFilePath = file.path;
            const correctFilePath = path.join(deviceUploadDir, file.filename);

            // Move file if it's not in the correct location
            if (currentFilePath !== correctFilePath) {
                await fs.move(currentFilePath, correctFilePath, {
                    overwrite: true,
                });
                logger.info(
                    `Moved file to correct device directory: ${correctFilePath}`
                );
            }

            const fileMetadata = {
                id: path.basename(file.filename, path.extname(file.filename)),
                name: file.originalname,
                size: file.size,
                type: path.extname(file.originalname),
                mimeType: file.mimetype,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                url: `/files/${deviceId}/${file.filename}`,
                thumbnailUrl: file.mimetype.startsWith('image/')
                    ? `/files/${deviceId}/thumbnails/${file.filename}`
                    : undefined,
            };

            logger.info(
                `File uploaded successfully: ${file.filename} for device ${deviceId}`
            );
            return res.status(200).json(fileMetadata);
        } catch (error) {
            logger.error('Error uploading file:', error);
            return res.status(500).json({ error: 'Failed to upload file' });
        }
    },

    deleteFile: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const deviceId = req.headers['x-device-id'] as string;

            if (!deviceId) {
                logger.warn('No device ID provided');
                return res.status(400).json({ error: 'Device ID is required' });
            }

            const deviceUploadDir = path.join(config.uploadDir, deviceId);
            logger.info(`Device upload directory: ${deviceUploadDir}`);

            // Ensure device directory exists
            if (!(await fs.pathExists(deviceUploadDir))) {
                logger.warn(`Device directory not found: ${deviceUploadDir}`);
                return res.status(404).json({ error: 'File not found' });
            }

            // Get list of files in device's upload directory
            const files = await fs.readdir(deviceUploadDir);
            logger.info(`Files in device directory: ${files.join(', ')}`);

            let targetFile: string | undefined;

            // First check if the ID matches a filename directly
            if (files.includes(id)) {
                logger.info(`Found exact filename match: ${id}`);
                targetFile = id;
            } else {
                // If no direct match, look for a file containing the ID
                targetFile = files.find((file) => file.includes(`-${id}`));
                if (targetFile) {
                    logger.info(
                        `Found file containing ID in name: ${targetFile}`
                    );
                } else {
                    logger.warn(`No file found matching ID: ${id}`);
                    return res.status(404).json({ error: 'File not found' });
                }
            }

            const filePath = path.join(deviceUploadDir, targetFile);
            logger.info(`Attempting to delete file at path: ${filePath}`);

            // Check if file exists before attempting deletion
            if (!(await fs.pathExists(filePath))) {
                logger.error(`File not found at path: ${filePath}`);
                return res.status(404).json({ error: 'File not found' });
            }

            // Delete the file
            await fs.remove(filePath);
            logger.info(`Successfully deleted file: ${targetFile}`);

            // Delete thumbnail if exists
            const thumbnailPath = path.join(
                deviceUploadDir,
                'thumbnails',
                targetFile
            );
            logger.info(`Checking for thumbnail at: ${thumbnailPath}`);

            if (await fs.pathExists(thumbnailPath)) {
                logger.info(`Deleting thumbnail at: ${thumbnailPath}`);
                await fs.remove(thumbnailPath);
            }

            return res
                .status(200)
                .json({ message: 'File deleted successfully' });
        } catch (error) {
            logger.error('Error deleting file:', error);
            return res.status(500).json({ error: 'Failed to delete file' });
        }
    },
};

import { createClient } from 'redis';
import { config } from '../config';
import logger from '../utils/logger';
import { UploadProgress } from '../types/api';

const client = createClient({
    url: config.redis.url,
});

client.on('error', (err) => logger.error('Redis Client Error', err));

export const redisService = {
    async connect() {
        await client.connect();
        logger.info('Connected to Redis');
    },

    async disconnect() {
        await client.disconnect();
        logger.info('Disconnected from Redis');
    },

    async setUploadProgress(fileId: string, progress: UploadProgress) {
        await client.set(`upload:${fileId}`, JSON.stringify(progress));
    },

    async getUploadProgress(fileId: string): Promise<UploadProgress | null> {
        const data = await client.get(`upload:${fileId}`);
        return data ? JSON.parse(data) : null;
    },

    async deleteUploadProgress(fileId: string) {
        await client.del(`upload:${fileId}`);
    },

    async setChunkStatus(fileId: string, chunkIndex: number, status: boolean) {
        await client.setBit(`chunks:${fileId}`, chunkIndex, status ? 1 : 0);
    },

    async getChunkStatus(fileId: string, chunkIndex: number): Promise<boolean> {
        const status = await client.getBit(`chunks:${fileId}`, chunkIndex);
        return status === 1;
    },

    async getAllChunkStatuses(
        fileId: string,
        totalChunks: number
    ): Promise<boolean[]> {
        const statuses = await client.getRange(
            `chunks:${fileId}`,
            0,
            totalChunks - 1
        );
        return statuses.split('').map((bit) => bit === '1');
    },
};

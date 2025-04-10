export interface FileMetadata {
    id: string;
    name: string;
    type: string;
    size: number;
    mimeType: string;
    createdAt: string;
    updatedAt: string;
    url: string;
    thumbnailUrl?: string;
    deviceId: string;
}

export interface UploadChunk {
    fileId: string;
    chunkIndex: number;
    totalChunks: number;
    data: Buffer | string;
    size: number;
}

export interface UploadProgress {
    fileId: string;
    progress: number;
    status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
    error?: string;
    totalChunks: number;
    deviceId: string;
}

export interface InitiateUploadResponse {
    fileId: string;
    uploadUrl: string;
    chunks: number;
    chunkSize: number;
    deviceId: string;
}

export interface UploadState {
    files: FileMetadata[];
    activeUploads: Record<string, UploadProgress>;
    uploadHistory: FileMetadata[];
}

export const API_ENDPOINTS = {
    UPLOAD: {
        INITIATE: '/upload/initiate',
        CHUNK: '/upload/chunk',
        FINALIZE: '/upload/finalize',
        STATUS: '/upload/status',
        CANCEL: '/upload/cancel',
    },
    FILES: {
        LIST: '/files',
        DELETE: '/files/:id',
        DETAILS: '/files/:id',
    },
} as const;

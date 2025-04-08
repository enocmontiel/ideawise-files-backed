# File Upload Backend Service

A Node.js backend service for handling chunked file uploads with support for resumable uploads, progress tracking, and file management.

## Features

-   Chunked file uploads (1MB chunks)
-   Resumable uploads
-   Progress tracking
-   File type validation
-   Rate limiting
-   Redis-based upload state management
-   Automatic cleanup of incomplete uploads
-   Support for images and videos

## Prerequisites

-   Node.js (v14 or higher)
-   Redis server
-   TypeScript

## Installation

1. Clone the repository
2. Install dependencies:
    ```bash
    npm install
    ```
3. Create a `.env` file in the root directory with the following variables:
    ```
    PORT=3000
    NODE_ENV=development
    UPLOAD_DIR=uploads
    CHUNK_SIZE=1048576
    MAX_FILE_SIZE=104857600
    REDIS_URL=redis://localhost:6379
    RATE_LIMIT_WINDOW_MS=60000
    RATE_LIMIT_MAX_REQUESTS=10
    ```

## Development

Start the development server:

```bash
npm run dev
```

## Production

Build the project:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## API Endpoints

### Upload Endpoints

-   `POST /api/upload/initiate`

    -   Initiates a new file upload
    -   Request body: `{ fileName, fileSize, mimeType }`
    -   Response: `{ fileId, uploadUrl, chunks, chunkSize }`

-   `POST /api/upload/chunk`

    -   Uploads a file chunk
    -   Form data: `{ fileId, chunkIndex, totalChunks, chunk }`
    -   Response: `{ success: true }`

-   `POST /api/upload/finalize`

    -   Finalizes the upload
    -   Request body: `{ fileId, fileName }`
    -   Response: `FileMetadata`

-   `GET /api/upload/status/:fileId`

    -   Gets the upload status
    -   Response: `{ fileId, progress, status, error? }`

-   `POST /api/upload/cancel`
    -   Cancels an upload
    -   Request body: `{ fileId }`
    -   Response: `{ success: true }`

## Error Handling

The service includes comprehensive error handling for:

-   Invalid file types
-   File size limits
-   Rate limiting
-   Network errors
-   Server errors

## Logging

Logs are written to:

-   Console (development)
-   `logs/error.log` (error logs)
-   `logs/combined.log` (all logs)

## Security

-   File type validation
-   Rate limiting
-   CORS enabled
-   Secure file handling
-   Redis-based state management

## License

ISC

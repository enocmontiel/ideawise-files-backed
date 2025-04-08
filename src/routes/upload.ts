import { Router, Request, Response, NextFunction } from 'express';
import { uploadController } from '../controllers/upload';
import { upload, errorHandler } from '../middleware/upload';
import { uploadRateLimit } from '../middleware/rateLimit';
import { API_ENDPOINTS } from '../types/api';

const router = Router();

router.post(
    API_ENDPOINTS.UPLOAD.INITIATE,
    uploadRateLimit,
    uploadController.initiateUpload
);

router.post(
    API_ENDPOINTS.UPLOAD.CHUNK,
    uploadRateLimit,
    (req: Request, res: Response, next: NextFunction) => {
        // Check if the request has a file upload or base64 data
        const contentType = req.headers['content-type'] || '';

        if (contentType.includes('multipart/form-data')) {
            // Use Multer for file uploads
            upload.single('chunk')(req, res, next);
        } else if (contentType.includes('application/json')) {
            // Skip Multer for base64 data in JSON
            next();
        } else {
            // For other content types, try to use Multer
            upload.single('chunk')(req, res, next);
        }
    },
    errorHandler,
    uploadController.uploadChunk
);

router.post(
    API_ENDPOINTS.UPLOAD.FINALIZE,
    uploadRateLimit,
    uploadController.finalizeUpload
);

router.get(
    `${API_ENDPOINTS.UPLOAD.STATUS}/:fileId`,
    uploadRateLimit,
    uploadController.getUploadStatus
);

router.post(
    API_ENDPOINTS.UPLOAD.CANCEL,
    uploadRateLimit,
    uploadController.cancelUpload
);

export default router;

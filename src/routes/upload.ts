import { Router } from 'express';
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
    upload.single('chunk'),
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

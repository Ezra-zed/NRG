import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import AppError from './AppError.js';

/**
 * Multer file-upload wiring used by any endpoint that accepts files
 * (customer electricity bill, company GST/business registration certificates,
 * completed-project photos, …).
 *
 * General media is stored under <projectRoot>/uploads and served with safe
 * content headers. Customer bills use a private subdirectory and an
 * authorization-checked download route.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(here, '..', 'uploads');
export const PRIVATE_UPLOAD_DIR = path.join(UPLOAD_DIR, 'private');

for (const directory of [UPLOAD_DIR, PRIVATE_UPLOAD_DIR]) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
}

const createDiskStorage = (directory) => multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, directory),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const uploadTypes = new Map([
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

export const safeUploadFileFilter = (_req, file, cb) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (uploadTypes.get(extension) !== file.mimetype) {
    cb(new AppError('Only PDF, PNG, JPG, JPEG, and WEBP uploads are allowed.', 400));
    return;
  }
  cb(null, true);
};

/** Multipart uploader capped at 10 MB per file. */
export const upload = multer({
  storage: createDiskStorage(UPLOAD_DIR),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: safeUploadFileFilter,
});

/** Customer bills are kept outside the publicly mounted upload directory. */
export const privateUpload = multer({
  storage: createDiskStorage(PRIVATE_UPLOAD_DIR),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: safeUploadFileFilter,
});

const currentBillMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const currentBillExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

export const currentBillFileFilter = (_req, file, cb) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  console.log('[CURRENT_BILL][FILTER]', JSON.stringify({
    originalName: file.originalname,
    mimeType: file.mimetype,
    extension,
    acceptedMimeType: currentBillMimeTypes.has(file.mimetype),
    acceptedExtension: currentBillExtensions.has(extension),
  }));

  if (!currentBillMimeTypes.has(file.mimetype) || !currentBillExtensions.has(extension)) {
    console.error('[CURRENT_BILL][FILTER_REJECTED]', JSON.stringify({
      originalName: file.originalname,
      mimeType: file.mimetype,
      extension,
    }));
    cb(new AppError('currentBill must be a PDF, PNG, JPG, or JPEG file.', 400));
    return;
  }

  console.log('[CURRENT_BILL][FILTER_ACCEPTED]');
  cb(null, true);
};

/** In-memory uploader for the Cloudinary-backed current bill endpoint. */
export const currentBillUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: currentBillFileFilter,
});

/**
 * Convert an uploaded filename into the client-accessible URL path.
 * @param {string|undefined} filename Stored filename on disk.
 * @returns {string|undefined} e.g. "uploads/171234-o1a2b3c.jpg" or undefined.
 */
export const publicFileUrl = (filename) => (filename ? `uploads/${filename}` : undefined);
export const privateFileName = (filename) => filename || undefined;
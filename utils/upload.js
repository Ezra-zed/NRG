import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { fileURLToPath } from 'node:url';

/**
 * Multer file-upload wiring used by any endpoint that accepts files
 * (customer electricity bill, company GST/business registration certificates,
 * completed-project photos, …).
 *
 * Files are stored on disk under <projectRoot>/uploads and exposed to clients
 * at GET /uploads/<filename> (mounted in server.js).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(here, '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

/** Multipart uploader capped at 10 MB per file. */
export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * Convert an uploaded filename into the client-accessible URL path.
 * @param {string|undefined} filename Stored filename on disk.
 * @returns {string|undefined} e.g. "uploads/171234-o1a2b3c.jpg" or undefined.
 */
export const publicFileUrl = (filename) => (filename ? `uploads/${filename}` : undefined);
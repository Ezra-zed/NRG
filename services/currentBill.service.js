import cloudinary from '../config/cloudinary.js';
import AppError from '../utils/AppError.js';
import crypto from 'node:crypto';
import path from 'node:path';

export const CURRENT_BILL_FOLDER = 'enrg/current-bills';

/**
 * Upload a validated bill buffer to Cloudinary without writing it to disk.
 * The uploader parameter keeps the service easy to unit test.
 */
export const uploadCurrentBill = (file, uploader = cloudinary.uploader) => {
  console.log('[CURRENT_BILL][SERVICE_START]', JSON.stringify({
    originalName: file?.originalname,
    mimeType: file?.mimetype,
    size: file?.size,
    bufferLength: file?.buffer?.length,
    hasUploader: Boolean(uploader),
    cloudNameConfigured: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
    apiKeyConfigured: Boolean(process.env.CLOUDINARY_API_KEY),
    apiSecretConfigured: Boolean(process.env.CLOUDINARY_API_SECRET),
  }));

  if (!process.env.CLOUDINARY_CLOUD_NAME
    || !process.env.CLOUDINARY_API_KEY
    || !process.env.CLOUDINARY_API_SECRET) {
    console.error('[CURRENT_BILL][CONFIG_MISSING]');
    throw new AppError('Cloudinary is not configured for current bill uploads.', 500);
  }

  const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
  const extension = path.extname(file.originalname || '').toLowerCase();
  const format = extension.slice(1);
  const publicId = `${path.basename(file.originalname || 'current-bill', extension)}-${crypto.randomUUID()}`;

  console.log('[CURRENT_BILL][CLOUDINARY_START]', JSON.stringify({
    folder: CURRENT_BILL_FOLDER,
    resourceType,
    format,
    publicId,
    bufferLength: file.buffer?.length,
  }));

  return new Promise((resolve, reject) => {
    try {
      const stream = uploader.upload_stream(
        {
          folder: CURRENT_BILL_FOLDER,
          resource_type: resourceType,
          public_id: publicId,
          format,
        },
        (error, result) => {
          console.log('[CURRENT_BILL][CLOUDINARY_CALLBACK]', JSON.stringify({
            hasError: Boolean(error),
            error: error ? {
              name: error.name,
              message: error.message,
              httpCode: error.http_code,
              code: error.code,
            } : null,
            hasResult: Boolean(result),
            secureUrl: Boolean(result?.secure_url),
            resultPublicId: result?.public_id,
          }));

          if (error || !result?.secure_url) {
            const uploadError = new AppError('Current bill upload failed. Please try again.', 500);
            uploadError.cause = error;
            reject(uploadError);
            return;
          }
          resolve(result.secure_url);
        }
      );

      console.log('[CURRENT_BILL][STREAM_CREATED]', JSON.stringify({ hasStream: Boolean(stream) }));
      stream.end(file.buffer);
      console.log('[CURRENT_BILL][STREAM_ENDED]', JSON.stringify({ bufferLength: file.buffer?.length }));
    } catch (error) {
      console.error('[CURRENT_BILL][STREAM_EXCEPTION]', JSON.stringify({
        name: error.name,
        message: error.message,
        code: error.code,
      }));
      const uploadError = new AppError('Current bill upload failed. Please try again.', 500);
      uploadError.cause = error;
      reject(uploadError);
    }
  });
};
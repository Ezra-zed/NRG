import cloudinary from '../config/cloudinary.js';
import AppError from '../utils/AppError.js';

export const CURRENT_BILL_FOLDER = 'enrg/current-bills';

/**
 * Upload a validated bill buffer to Cloudinary without writing it to disk.
 * The uploader parameter keeps the service easy to unit test.
 */
export const uploadCurrentBill = (file, uploader = cloudinary.uploader) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME
    || !process.env.CLOUDINARY_API_KEY
    || !process.env.CLOUDINARY_API_SECRET) {
    throw new AppError('Cloudinary is not configured for current bill uploads.', 500);
  }

  return new Promise((resolve, reject) => {
    try {
      const stream = uploader.upload_stream(
        { folder: CURRENT_BILL_FOLDER, resource_type: 'auto' },
        (error, result) => {
          if (error || !result?.secure_url) {
            reject(new AppError('Current bill upload failed. Please try again.', 500));
            return;
          }
          resolve(result.secure_url);
        }
      );

      stream.end(file.buffer);
    } catch (_error) {
      reject(new AppError('Current bill upload failed. Please try again.', 500));
    }
  });
};
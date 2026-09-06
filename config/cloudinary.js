import { v2 as cloudinary } from 'cloudinary';

const configuredCloudinaryUrl = process.env.CLOUDINARY_URL
  || process.env.CLOUDINARY_API_SECRET?.match(/^CLOUDINARY_URL=(cloudinary:\/\/.*)$/)?.[1];

let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
let apiKey = process.env.CLOUDINARY_API_KEY;
let apiSecret = process.env.CLOUDINARY_API_SECRET;

if (configuredCloudinaryUrl) {
  const parsedUrl = new URL(configuredCloudinaryUrl);
  cloudName ||= parsedUrl.hostname;
  apiKey ||= decodeURIComponent(parsedUrl.username);
  apiSecret = decodeURIComponent(parsedUrl.password);
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

export default cloudinary;
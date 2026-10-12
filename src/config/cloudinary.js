const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload an in-memory image buffer to Cloudinary.
 * Server-side safety net: even if the Flutter client forgot to compress,
 * we cap dimensions/quality here (1280x720, auto quality) to protect
 * free-tier storage & bandwidth.
 *
 * @param {Buffer} buffer
 * @param {string} folder  e.g. 'forijat/payment-proofs'
 * @returns {Promise<{url: string, publicId: string}>}
 */
function uploadBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 1280, height: 720, crop: 'limit' },
          { quality: 'auto:good', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

/**
 * رفع ملف صوتي (m4a/aac) — Cloudinary يعامل الصوت كـ resource_type: video
 */
function uploadAudio(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'video' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

module.exports = { cloudinary, uploadBuffer, uploadAudio };

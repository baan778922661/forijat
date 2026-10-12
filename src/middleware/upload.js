const multer = require('multer');

const storage = multer.memoryStorage();
const IMAGE_MIMES = /^image\/(jpeg|png|webp)$/;
const AUDIO_MIMES = /^audio\/(mp4|x-m4a|m4a|mpeg|aac|webm|ogg|wav)$/;

/** صور فقط — سندات الدفع والوثائق (حد 2MB) */
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_MIMES.test(file.mimetype)) return cb(new Error('Only JPEG/PNG/WebP images are allowed'));
    cb(null, true);
  },
});

/** صور + صوت — مرفقات الطلبات (صور مشكلة ≤2MB، ملاحظة صوتية m4a ≤8MB) */
const uploadMedia = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_MIMES.test(file.mimetype) || AUDIO_MIMES.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only images or audio (m4a/aac/mp3) are allowed'));
  },
});

module.exports = upload;
module.exports.uploadMedia = uploadMedia;

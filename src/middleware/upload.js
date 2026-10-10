const multer = require('multer');

/**
 * In-memory upload. Clients (Flutter) must pre-compress to <=300KB / 1280x720
 * via flutter_image_compress, but we still hard-cap at 2MB server-side and
 * re-compress through Cloudinary transformations as a safety net.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error('Only JPEG/PNG/WebP images are allowed'));
    }
    cb(null, true);
  },
});

module.exports = upload;

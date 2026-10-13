const router = require('express').Router();
const multer = require('multer');
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

// إعداد وسيط رفع الصور في الذاكرة (MemoryStorage) بحد أقصى 5 ميجابايت
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('الملف المرفوع يجب أن يكون صورة فقط'), false);
    }
  },
});

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/request-otp', ctrl.requestOtp);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/reset-password', ctrl.resetPassword);
router.get('/me', protect, ctrl.me);
router.patch('/location', protect, restrictTo('technician'), ctrl.updateLocation);
router.patch('/availability', protect, restrictTo('technician'), ctrl.setAvailability);
router.put('/change-password', protect, ctrl.changePassword);
router.patch('/profile', protect, ctrl.updateProfile);

// مسار الصورة الشخصية مع وسيط الرفع المعرّف
router.post('/avatar', protect, upload.single('image'), ctrl.uploadAvatar);
router.post('/logout-others', protect, ctrl.logoutOthers);

module.exports = router;
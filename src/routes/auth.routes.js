const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

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

module.exports = router;

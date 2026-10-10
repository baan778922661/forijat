const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', protect, ctrl.me);
router.patch('/location', protect, restrictTo('technician'), ctrl.updateLocation);
router.patch('/availability', protect, restrictTo('technician'), ctrl.setAvailability);

module.exports = router;

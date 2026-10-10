const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/paymentMethod.controller');

// Active channels — visible to authenticated clients & technicians
router.get('/', protect, ctrl.listActive);

// Admin CRUD (dynamic gateway management)
router.get('/all', protect, restrictTo('admin'), ctrl.listAll);
router.post('/', protect, restrictTo('admin'), ctrl.create);
router.patch('/:id', protect, restrictTo('admin'), ctrl.update);
router.patch('/:id/toggle', protect, restrictTo('admin'), ctrl.toggleActive);

module.exports = router;

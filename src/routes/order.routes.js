const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/order.controller');

router.use(protect);

// Client
router.post('/', restrictTo('client'), ctrl.createOrder);
router.post('/:id/inspection-proof', restrictTo('client'), upload.single('image'), ctrl.uploadInspectionProof);
router.post('/:id/labor-proof', restrictTo('client'), upload.single('image'), ctrl.uploadLaborProof);
router.post('/:id/cancel', restrictTo('client'), ctrl.cancelOrder);
router.get('/:id/otp', restrictTo('client'), ctrl.getOtp);

// Technician
router.get('/nearby', restrictTo('technician'), ctrl.nearbyOrders); // قبل /:id إلزاماً
router.put('/:id/accept', restrictTo('technician'), ctrl.acceptOrder);
router.put('/:id/start', restrictTo('technician'), ctrl.startJob);
router.put('/:id/complete', restrictTo('technician'), ctrl.completeWithOtp); // مرادف PUT
router.post('/:id/labor-fee', restrictTo('technician'), ctrl.proposeLaborFee);
router.post('/:id/spare-parts', restrictTo('technician'), upload.single('image'), ctrl.uploadSparePartsReceipt);
router.post('/:id/complete', restrictTo('technician'), ctrl.completeWithOtp);

// Shared
router.get('/mine', ctrl.myOrders);
router.get('/:id', ctrl.getOrder);

module.exports = router;

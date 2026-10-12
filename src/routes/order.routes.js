const router = require('express').Router();
const { protect, restrictTo, requireVerified } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadMedia } = require('../middleware/upload');
const ctrl = require('../controllers/order.controller');

router.use(protect);

// Client
router.post('/', restrictTo('client'), ctrl.createOrder);
router.post('/:id/inspection-proof', restrictTo('client'), upload.single('image'), ctrl.uploadInspectionProof);
router.post('/:id/labor-proof', restrictTo('client'), upload.single('image'), ctrl.uploadLaborProof);
router.post('/:id/voice-note', restrictTo('client'), uploadMedia.single('audio'), ctrl.uploadVoiceNote);
router.post('/:id/problem-images', restrictTo('client'), uploadMedia.array('images', 5), ctrl.uploadProblemImages);
router.post('/:id/repair-fee/respond', restrictTo('client'), ctrl.respondRepairFee);
router.post('/:id/rate', ctrl.rateOrder);
router.post('/:id/cancel', restrictTo('client'), ctrl.cancelOrder);
router.get('/:id/otp', restrictTo('client'), ctrl.getOtp);

// Technician
router.get('/nearby', restrictTo('technician'), requireVerified, ctrl.nearbyOrders); // قبل /:id إلزاماً
router.put('/:id/accept', restrictTo('technician'), requireVerified, ctrl.acceptOrder);
router.put('/:id/start', restrictTo('technician'), ctrl.startJob);
router.put('/:id/complete', restrictTo('technician'), ctrl.completeWithOtp); // مرادف PUT
router.post('/:id/labor-fee', restrictTo('technician'), ctrl.proposeLaborFee);
router.post('/:id/repair-fee', restrictTo('technician'), ctrl.proposeRepairFee);
router.post('/:id/spare-parts', restrictTo('technician'), upload.single('image'), ctrl.uploadSparePartsReceipt);
router.post('/:id/complete', restrictTo('technician'), ctrl.completeWithOtp);

// Shared
router.get('/mine', ctrl.myOrders);
router.get('/:id', ctrl.getOrder);

module.exports = router;

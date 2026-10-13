const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/admin.controller');

router.use(protect, restrictTo('admin'));

// Orders monitoring & technicians management
router.get('/orders', ctrl.listOrders);
router.get('/technicians', ctrl.listTechnicians);
router.patch('/technicians/:id/verify', ctrl.toggleVerifyTechnician);
router.patch('/technicians/:id/reject', ctrl.rejectTechnician);
router.get('/otps', ctrl.listLiveOtps);
router.get('/users', ctrl.listUsers);
router.put('/users/:id', ctrl.updateUser);
router.patch('/users/:id/toggle-ban', ctrl.toggleBanUser);
router.delete('/users/:id', ctrl.deleteUser);
router.put('/orders/:id/assign-technician', ctrl.assignTechnicianManual);

// Payment-proof review queue (one-tap approve/reject)
router.get('/orders/payment-queue', ctrl.paymentQueue);
router.post('/orders/:id/approve', ctrl.approvePayment);
router.post('/orders/:id/reject-payment', ctrl.rejectPayment);
router.patch('/orders/:id/status', ctrl.setOrderStatus);

// Daily payout batch operations
router.get('/withdrawals', ctrl.listWithdrawals);
router.post('/withdrawals/:id/complete', upload.single('receipt'), ctrl.completeWithdrawal);
router.post('/withdrawals/:id/reject', ctrl.rejectWithdrawal);

router.put('/orders/:id/warranty', ctrl.setWarranty);
router.get('/finance/summary', ctrl.financeSummary);
module.exports = router;

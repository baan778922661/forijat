const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/wallet.controller');

router.use(protect, restrictTo('technician'));

router.get('/', ctrl.getWallet);
router.get('/transactions', ctrl.getTransactions);
router.post('/withdraw', ctrl.requestWithdrawal);

module.exports = router;

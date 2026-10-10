const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const walletService = require('../services/wallet.service');

// GET /api/v1/wallet  (technician: three-bucket balance)
exports.getWallet = async (req, res, next) => {
  try {
    const wallet = await Wallet.findOneAndUpdate(
      { technicianId: req.user._id },
      { $setOnInsert: { technicianId: req.user._id } },
      { upsert: true, new: true }
    ).lean();
    res.json({ success: true, wallet });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/wallet/transactions
exports.getTransactions = async (req, res, next) => {
  try {
    const txs = await Transaction.find({ technicianId: req.user._id })
      .populate('payoutDetails.methodId', 'name type logoUrl')
      .sort('-createdAt')
      .limit(50)
      .lean();
    res.json({ success: true, transactions: txs });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/wallet/withdraw  { amount, methodId, recipientInfo }
exports.requestWithdrawal = async (req, res, next) => {
  try {
    const { amount, methodId, recipientInfo } = req.body;
    const tx = await walletService.requestWithdrawal(req.user._id, Number(amount), methodId, recipientInfo);
    res.status(201).json({ success: true, transaction: tx });
  } catch (err) {
    next(err);
  }
};

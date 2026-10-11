const Order = require('../models/Order');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { uploadBuffer } = require('../config/cloudinary');
const walletService = require('../services/wallet.service');
const orderController = require('./order.controller');

// GET /api/v1/admin/orders/payment-queue  (receipts awaiting verification)
exports.paymentQueue = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const orders = await Order.find({ status: 'payment_verifying', 'financials.paymentStatus': { $ne: 'approved' } })
      .populate('clientId', 'name phone')
      .sort('createdAt')
      .limit(100)
      .lean();
    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/admin/orders/:id/approve  (verify receipt -> escrow -> assign nearest technician)
exports.approvePayment = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, status: 'payment_verifying' });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found or already processed' });

    if (order.financials.laborPaymentProofUrl && order.status === 'payment_verifying' && order.technicianId) {
      // Labor-fee top-up verified: back to work
      order.status = 'in_progress';
      await order.save();
      return res.json({ success: true, order, assigned: null });
    }

    // 1) الاعتماد يُحفظ دائماً — بغض النظر عن توفر فني حالياً
    order.financials.paymentStatus = 'approved';
    order.paymentApprovedAt = new Date();
    const tech = await orderController.assignNearestTechnician(order); // يحفظ 'assigned' عند نجاحه
    if (tech) {
      console.log('Order approved & assigned:', order._id.toString(), '->', tech.name);
      return res.json({ success: true, message: 'تم الاعتماد وإسناد الفني', order, assigned: tech });
    }
    // 2) لا فني متاح: حالة وسيطة — الطلب يخرج من الطابور فوراً ولا يعلق أبداً
    order.status = 'searching_technician';
    const saved = await order.save();
    console.log('Order approved, searching technician:', saved._id.toString(), saved.status);
    return res.json({ success: true, message: 'تم اعتماد الدفع — جارٍ البحث عن فني', order: saved, assigned: null });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/admin/orders/:id/reject-payment
exports.rejectPayment = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, status: 'payment_verifying' });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.financials.laborPaymentProofUrl && order.technicianId) {
      order.status = 'price_update_pending'; // client must re-upload
      order.financials.laborPaymentProofUrl = undefined;
    } else {
      order.status = 'pending_payment_proof';
      order.financials.inspectionPaymentProofUrl = undefined;
    }
    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/admin/withdrawals?status=pending  (grouped per channel for daily batch payout)
exports.listWithdrawals = async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const txs = await Transaction.find({ type: 'withdrawal', status })
      .populate('technicianId', 'name phone')
      .populate('payoutDetails.methodId', 'name type logoUrl')
      .sort('createdAt')
      .limit(200)
      .lean();

    // Group by payment channel so the admin executes one batch per channel
    const grouped = txs.reduce((acc, tx) => {
      const key = tx.payoutDetails?.methodId?._id?.toString() || 'unknown';
      (acc[key] ||= { method: tx.payoutDetails?.methodId || null, items: [] }).items.push(tx);
      return acc;
    }, {});
    res.json({ success: true, grouped });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/admin/withdrawals/:id/complete  (attach bank receipt + reference)
exports.completeWithdrawal = async (req, res, next) => {
  try {
    let receiptImageUrl;
    if (req.file) {
      const uploaded = await uploadBuffer(req.file.buffer, 'forijat/payout-receipts');
      receiptImageUrl = uploaded.url;
    }
    const tx = await walletService.completeWithdrawal(req.params.id, {
      receiptImageUrl,
      referenceNumber: req.body.referenceNumber,
    });
    res.json({ success: true, transaction: tx });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/admin/withdrawals/:id/reject
exports.rejectWithdrawal = async (req, res, next) => {
  try {
    const tx = await walletService.rejectWithdrawal(req.params.id);
    res.json({ success: true, transaction: tx });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/admin/orders?status=&limit=  (شاشة مراقبة كل الطلبات)
exports.listOrders = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const orders = await Order.find(filter)
      .populate('clientId', 'name phone')
      .populate('technicianId', 'name phone')
      .select('-otpVerificationCode')
      .sort('-createdAt')
      .limit(Math.min(Number(req.query.limit) || 100, 200))
      .lean();
    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/admin/technicians  (إدارة حسابات الفنيين)
exports.listTechnicians = async (req, res, next) => {
  try {
    const technicians = await User.find({ role: 'technician' })
      .select('-passwordHash')
      .sort('-createdAt')
      .limit(300)
      .lean();
    res.json({ success: true, technicians });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/admin/technicians/:id/verify  (تفعيل/تعطيل توثيق الفني)
exports.toggleVerifyTechnician = async (req, res, next) => {
  try {
    const tech = await User.findOne({ _id: req.params.id, role: 'technician' });
    if (!tech) return res.status(404).json({ success: false, message: 'الفني غير موجود' });
    tech.isVerified = true;
    tech.technicianProfile = tech.technicianProfile || {};
    tech.technicianProfile.verificationStatus = 'verified';
    tech.technicianProfile.rejectionReason = undefined;
    await tech.save();
    res.json({ success: true, technician: { _id: tech._id, isVerified: true } });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/admin/technicians/:id/reject  { reason } — يظهر السبب في تطبيق الفني
exports.rejectTechnician = async (req, res, next) => {
  try {
    const tech = await User.findOne({ _id: req.params.id, role: 'technician' });
    if (!tech) return res.status(404).json({ success: false, message: 'الفني غير موجود' });
    tech.isVerified = false;
    tech.technicianProfile = tech.technicianProfile || {};
    tech.technicianProfile.verificationStatus = 'rejected';
    tech.technicianProfile.rejectionReason = req.body.reason || 'لم تطابق الوثائق المتطلبات';
    await tech.save();
    res.json({ success: true, technician: { _id: tech._id, isVerified: false } });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/admin/orders/:id/status  (dispute handling etc.)
exports.setOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['disputed', 'cancelled', 'in_progress'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Unsupported manual status' });
    }
    const order = await Order.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

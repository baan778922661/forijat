const Order = require('../models/Order');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { uploadBuffer } = require('../config/cloudinary');
const walletService = require('../services/wallet.service');
const Otp = require('../models/Otp');
const orderController = require('./order.controller');

// GET /api/v1/admin/orders/payment-queue  (receipts awaiting verification)
exports.paymentQueue = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    // الطابور بالمرحلة: سند كشف معلق أو سند أجور يد معلق — نفس الطلب قد يدخل مرتين
    const orders = await Order.find({
      status: 'payment_verifying',
      'financials.pendingProofType': { $in: ['inspection', 'labor'] },
    })
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

    // التفرع الصريح على مرحلة السند
    if (order.financials.pendingProofType === 'labor' && order.financials.laborPaymentProofUrl) {
      // سند أجور اليد/القطع معتمد ← يُعتمد المبلغ فعلياً ويستمر التنفيذ
      order.financials.repairFeeStatus = 'approved';
      order.financials.pendingProofType = 'none';
      order.status = 'in_progress';
      const saved = await order.save();
      console.log('Labor proof approved:', saved._id.toString());
      return res.json({ success: true, message: 'تم اعتماد سند أجور اليد — الطلب قيد التنفيذ', order: saved, assigned: null });
    }

    // 1) الاعتماد يُحفظ دائماً — بغض النظر عن توفر فني حالياً
    order.financials.paymentStatus = 'approved';
    order.financials.pendingProofType = 'none'; // خرج من طابور الكشف نهائياً
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

    if (order.financials.pendingProofType === 'labor') {
      order.status = 'price_update_pending'; // العميل يعيد رفع سند الأجور فقط
      order.financials.laborPaymentProofUrl = undefined;
    } else {
      order.status = 'pending_payment_proof';
      order.financials.inspectionPaymentProofUrl = undefined;
    }
    order.financials.pendingProofType = 'none';
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

// GET /api/v1/admin/otps — الأكواد الحية غير المنتهية
exports.listLiveOtps = async (req, res, next) => {
  try {
    const otps = await Otp.find({ isUsed: false, expiresAt: { $gt: new Date() } })
      .sort('-createdAt').limit(50).lean();
    const phones = otps.map((o) => o.phone);
    const users = await User.find({ phone: { $in: phones } }).select('phone name role').lean();
    const byPhone = Object.fromEntries(users.map((u) => [u.phone, u]));
    res.json({ success: true, otps: otps.map((o) => ({ ...o, user: byPhone[o.phone] || null })) });
  } catch (err) { next(err); }
};

// GET /api/v1/admin/users?role=&city=&q= — بحث وفلاتر
exports.listUsers = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.city) filter.city = req.query.city;
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).trim(), 'i');
      filter.$or = [{ name: rx }, { phone: rx }];
    }
    const users = await User.find(filter).select('-passwordHash').sort('-createdAt').limit(300).lean();
    res.json({ success: true, users });
  } catch (err) { next(err); }
};

// PUT /api/v1/admin/users/:id — تعديل بيانات عميل أو فني
exports.updateUser = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'city', 'district', 'neighborhood', 'detailedAddress', 'isVerified'];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (update.phone) update.phone = String(update.phone).trim();
    if (Array.isArray(req.body.skills)) update['technicianProfile.skills'] = req.body.skills;
    const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    res.json({ success: true, user });
  } catch (err) { next(err); }
};

// PATCH /api/v1/admin/users/:id/toggle-ban  { reason? }
exports.toggleBanUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'لا يمكن حظر مدير' });
    user.isActive = !user.isActive;
    user.banReason = user.isActive ? undefined : (req.body.reason || 'مخالفة شروط الاستخدام');
    await user.save();
    res.json({ success: true, user: { _id: user._id, isActive: user.isActive } });
  } catch (err) { next(err); }
};

// DELETE /api/v1/admin/users/:id
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'لا يمكن حذف مدير' });
    await user.deleteOne();
    res.json({ success: true, message: 'تم حذف المستخدم نهائياً' });
  } catch (err) { next(err); }
};

// PUT /api/v1/admin/orders/:id/assign-technician  { technicianId } — إسناد يدوي
exports.assignTechnicianManual = async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const tech = await User.findOne({ _id: req.body.technicianId, role: 'technician', isVerified: true });
    if (!tech) return res.status(404).json({ success: false, message: 'الفني غير موجود أو غير موثق' });
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['searching_technician', 'payment_verifying'] }, technicianId: null },
      { $set: {
          technicianId: tech._id,
          status: 'assigned',
          otpVerificationCode: crypto.randomInt(100000, 999999).toString(),
          otpGeneratedAt: new Date(),
        } },
      { new: true }
    );
    if (!order) return res.status(409).json({ success: false, message: 'الطلب غير قابل للإسناد حالياً' });
    res.json({ success: true, order, assigned: { _id: tech._id, name: tech.name } });
  } catch (err) { next(err); }
};

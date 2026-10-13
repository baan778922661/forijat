const crypto = require('crypto');
const Order = require('../models/Order');
const { uploadBuffer, uploadAudio } = require('../config/cloudinary');
const { findNearestTechnician } = require('../services/geo.service');
const walletService = require('../services/wallet.service');

const WARRANTY_DAYS = 14;

// POST /api/v1/orders  (client books: category + location + inspection fee)
// يقبل serviceType أو serviceCategory، و address أو addressDetails (توافقية).
exports.createOrder = async (req, res, next) => {
  try {
    const {
      serviceCategory, serviceType, description,
      longitude, latitude, address, addressDetails, landmark, inspectionFee,
      city, district, neighborhood,
    } = req.body;

    const category = serviceCategory || serviceType;
    const lng = Number(longitude);
    const lat = Number(latitude);

    if (!category || !['solar', 'electricity', 'ac', 'plumbing'].includes(category)) {
      return res.status(400).json({ success: false, message: 'serviceType غير صالح أو مفقود' });
    }
    // تحقق صارم من الإحداثيات ونطاقاتها الجغرافية
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      return res.status(400).json({ success: false, message: 'إحداثيات الموقع غير صالحة' });
    }
    if (!inspectionFee || Number(inspectionFee) <= 0) {
      return res.status(400).json({ success: false, message: 'inspectionFee مطلوب' });
    }

    const order = await Order.create({
      googleMapsUrl: req.body.googleMapsUrl || '',
      clientId: req.user._id,
      serviceCategory: category,
      description,
      // الترتيب القياسي لـ MongoDB: [longitude, latitude] — خط الطول أولاً
      location: {
        type: 'Point',
        coordinates: [lng, lat],
        address: address || addressDetails,
        addressDetails: addressDetails || address,
        landmark,
      },
      city: city || req.user.city,         // لقطة المنطقة للمطابقة الهرمية
      district: district || req.user.district,
      neighborhood: neighborhood || req.user.neighborhood,
      financials: { inspectionFee: Number(inspectionFee) },
      status: 'pending_payment_proof',
    });
    // استجابة فورية مؤكدة — لا عمليات جانبية (Sockets / بحث جغرافي) هنا
    return res.status(201).json({ success: true, message: 'تم إنشاء الطلب بنجاح', order });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/orders/:id/inspection-proof  (client uploads transfer receipt image)
exports.uploadInspectionProof = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Image file is required' });
    const order = await Order.findOne({ _id: req.params.id, clientId: req.user._id, status: 'pending_payment_proof' });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found or wrong state' });

    const { url } = await uploadBuffer(req.file.buffer, 'forijat/payment-proofs');
    order.financials.inspectionPaymentProofUrl = url;
    order.financials.inspectionReference = req.body.referenceNumber || undefined;
    order.financials.pendingProofType = 'inspection';
    order.financials.paymentStatus = 'pending'; // الطابور يعتمد المرحلة
    order.status = 'payment_verifying';
    await order.save();

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/orders/mine  (client or technician feed, lean for weak networks)
exports.myOrders = async (req, res, next) => {
  try {
    const filter = req.user.role === 'technician' ? { technicianId: req.user._id } : { clientId: req.user._id };
    const orders = await Order.find(filter)
      .select('-otpVerificationCode')
      .sort('-createdAt')
      .limit(50)
      .lean();
    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/orders/:id
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('clientId', 'name phone avatarUrl')
      .populate('technicianId', 'name phone avatarUrl technicianProfile.ratingAverage')
      .lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const isParty = [order.clientId?._id?.toString(), order.technicianId?._id?.toString()].includes(req.user._id.toString());
    if (!isParty && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Forbidden' });
    if (req.user.role !== 'admin') delete order.otpVerificationCode; // OTP only shown to client
    if (req.user.role === 'client') order.otpVerificationCode = undefined; // client gets OTP via dedicated field below
    res.json({ success: true, order, ...(req.user.role === 'client' ? {} : {}) });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/orders/:id/otp  (client views the OTP to hand to the technician)
exports.getOtp = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, clientId: req.user._id }).select('otpVerificationCode status');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, otp: order.otpVerificationCode, status: order.status });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/orders/:id/labor-fee  (technician proposes additional labor fee)
exports.proposeLaborFee = async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'amount must be positive' });
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, technicianId: req.user._id, status: { $in: ['assigned', 'in_progress'] } },
      { $set: { 'financials.additionalLaborFee': amount, status: 'price_update_pending' } },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found or wrong state' });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/orders/:id/labor-proof  (client approves + uploads labor payment receipt)
exports.uploadLaborProof = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Image file is required' });
    const order = await Order.findOne({ _id: req.params.id, clientId: req.user._id, status: 'price_update_pending' });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found or wrong state' });

    const { url } = await uploadBuffer(req.file.buffer, 'forijat/payment-proofs');
    order.financials.laborPaymentProofUrl = url;
    order.financials.pendingProofType = 'labor'; // سند المرحلة الثانية — مستقل عن الأول
    order.status = 'payment_verifying';
    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/orders/:id/spare-parts  (technician uploads stamped store invoice, out of commission scope)
exports.uploadSparePartsReceipt = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Image file is required' });
    const { url } = await uploadBuffer(req.file.buffer, 'forijat/spare-parts');
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, technicianId: req.user._id },
      { $push: { 'financials.sparePartsReceiptUrls': url } },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/orders/:id/complete  (technician enters client's OTP -> escrow release)
exports.completeWithOtp = async (req, res, next) => {
  try {
    const { otp } = req.body;
    const order = await Order.findOne({ _id: req.params.id, technicianId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: `Order cannot be completed from state ${order.status}` });
    }
    if (!order.otpVerificationCode || order.otpVerificationCode !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    const f = order.financials;
    const gross = f.inspectionFee + (f.additionalLaborFee || 0) + (f.repairFeeStatus === 'approved' ? (f.repairFee || 0) : 0);
    const { commissionAmount, payoutAmount } = await walletService.creditEarning(
      order.technicianId,
      order._id,
      gross,
      order.financials.platformCommissionPercent
    );

    order.financials.platformCommissionAmount = commissionAmount;
    order.financials.technicianPayoutAmount = payoutAmount;
    order.status = 'completed';
    order.warrantyUntil = new Date(Date.now() + WARRANTY_DAYS * 24 * 60 * 60 * 1000);
    // كرت الضمان الرقمي
    order.warranty = {
      isGuaranteed: true,
      durationDays: WARRANTY_DAYS,
      validUntil: order.warrantyUntil,
      terms: 'ضمان فُرِجَت: إصلاح مجاني لأي عطل في نفس العمل خلال مدة الضمان. يسقط الضمان عند أي اتفاق مباشر مع الفني خارج التطبيق.',
    };
    order.otpVerificationCode = undefined; // burn the OTP
    await order.save();

    res.json({ success: true, order, warrantyDays: WARRANTY_DAYS });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/orders/:id/cancel
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, clientId: req.user._id, status: { $in: ['pending_payment_proof', 'payment_verifying'] } },
      { $set: { status: 'cancelled' } },
      { new: true }
    );
    if (!order) return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/orders/nearby?maxDistance=20000  (technician: الطلبات القريبة المطابقة لمهاراته)
exports.nearbyOrders = async (req, res, next) => {
  try {
    const tp = req.user.technicianProfile || {};
    const skills = tp.skills || [];
    // المطابقة الهرمية الأساسية: تخصص + محافظة + مديرية + موثق ومتصل
    const filter = {
      status: { $in: ['searching_technician', 'payment_verifying'] },
      technicianId: null,
      ...(skills.length ? { serviceCategory: { $in: skills } } : {}),
      ...(req.user.city ? { city: req.user.city } : {}),
      ...(req.user.district ? { district: req.user.district } : {}),
    };
    const orders = await Order.find(filter)
      .select('-otpVerificationCode')
      .populate('clientId', 'name phone city district')
      .sort('-createdAt')
      .limit(30)
      .lean();
    res.json({ success: true, orders });
  } catch (err) { next(err); }
};

// PUT /api/v1/orders/:id/accept  (قبول ذري — يُسند فقط إن كان بلا فني)
exports.acceptOrder = async (req, res, next) => {
  try {
    const otp = crypto.randomInt(100000, 999999).toString();
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['searching_technician', 'payment_verifying'] }, technicianId: null },
      { $set: { technicianId: req.user._id, status: 'assigned', otpVerificationCode: otp, otpGeneratedAt: new Date() } },
      { new: true }
    );
    if (!order) {
      return res.status(409).json({ success: false, message: 'الطلب لم يعد متاحاً — قبِله فني آخر' });
    }
    const safe = order.toObject();
    delete safe.otpVerificationCode; // الرمز للعميل فقط
    res.json({ success: true, order: safe });
  } catch (err) {
    next(err);
  }
};

// PUT /api/v1/orders/:id/start  (بدء العمل: assigned → in_progress)
exports.startJob = async (req, res, next) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, technicianId: req.user._id, status: 'assigned' },
      { $set: { status: 'in_progress' } },
      { new: true }
    );
    if (!order) {
      return res.status(400).json({ success: false, message: 'لا يمكن بدء الطلب من حالته الحالية' });
    }
    const safe = order.toObject();
    delete safe.otpVerificationCode;
    res.json({ success: true, order: safe });
  } catch (err) {
    next(err);
  }
};

// ===== Internal helpers used by admin controller =====
exports.assignNearestTechnician = async (order) => {
  const candidates = await findNearestTechnician(order.location.coordinates, order.serviceCategory, 30000, { city: order.city, district: order.district });
  if (!candidates.length) return null;
  const tech = candidates[0];
  const otp = crypto.randomInt(100000, 999999).toString();
  order.technicianId = tech._id;
  order.otpVerificationCode = otp;
  order.otpGeneratedAt = new Date();
  order.status = 'assigned';
  await order.save();
  return tech;
};

// ===== المرفقات =====
// POST /api/v1/orders/:id/voice-note  (client — ملاحظة صوتية m4a)
exports.uploadVoiceNote = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'الملف الصوتي مطلوب' });
    const order = await Order.findOne({ _id: req.params.id, clientId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const { url } = await uploadAudio(req.file.buffer, 'forijat/voice-notes');
    order.voiceNoteUrl = url;
    await order.save();
    res.json({ success: true, voiceNoteUrl: url });
  } catch (err) { next(err); }
};

// POST /api/v1/orders/:id/problem-images  (client — حتى 5 صور)
exports.uploadProblemImages = async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, message: 'الصور مطلوبة' });
    const order = await Order.findOne({ _id: req.params.id, clientId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const urls = [];
    for (const file of files.slice(0, 5)) {
      const { url } = await uploadBuffer(file.buffer, 'forijat/problem-images');
      urls.push(url);
    }
    order.problemImages = [...(order.problemImages || []), ...urls].slice(0, 5);
    await order.save();
    res.json({ success: true, problemImages: order.problemImages });
  } catch (err) { next(err); }
};

// ===== تكلفة الإصلاح الإضافية =====
// POST /api/v1/orders/:id/repair-fee  (technician) { amount }
exports.proposeRepairFee = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'المبلغ غير صالح' });
    }
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, technicianId: req.user._id, status: { $in: ['assigned', 'in_progress'] } },
      { $set: { 'financials.repairFee': amount, 'financials.repairFeeStatus': 'pending_approval', status: 'price_update_pending' } },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود أو بحالة لا تسمح' });
    res.json({ success: true, order });
  } catch (err) { next(err); }
};

// POST /api/v1/orders/:id/repair-fee/respond  (client) { decision: 'approve' | 'reject' }
exports.respondRepairFee = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id, clientId: req.user._id,
      status: 'price_update_pending', 'financials.repairFeeStatus': 'pending_approval',
    });
    if (!order) return res.status(404).json({ success: false, message: 'لا توجد مطالبة بانتظار الرد' });
    if (req.body.decision === 'approve') {
      order.financials.repairFeeStatus = 'pending_approval'; // يُعتمد فعلياً بعد اعتماد سنده
      // يبقى price_update_pending — العميل يرفع سند التحويل عبر labor-proof ثم تعتمده الإدارة
      await order.save();
      return res.json({ success: true, message: 'تمت الموافقة — أكمل برفع سند التحويل', order });
    }
    // رفض: الاكتفاء بالكشفية فقط والعودة للتنفيذ
    order.financials.repairFee = 0;
    order.financials.repairFeeStatus = 'rejected';
    order.status = 'in_progress';
    await order.save();
    res.json({ success: true, message: 'تم الرفض — سيُكتفى بأجر الكشفية', order });
  } catch (err) { next(err); }
};

// ===== التقييم المزدوج =====
// POST /api/v1/orders/:id/rate  { stars: 1-5, comment } — العميل يقيّم الفني والعكس
exports.rateOrder = async (req, res, next) => {
  try {
    const stars = Number(req.body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ success: false, message: 'التقييم من 1 إلى 5 نجوم' });
    }
    const order = await Order.findById(req.params.id);
    if (!order || order.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'التقييم متاح بعد اكتمال الطلب فقط' });
    }
    const uid = req.user._id.toString();
    const entry = { stars, comment: req.body.comment || '', at: new Date() };

    if (order.clientId?.toString() === uid) {
      if (order.ratings?.clientRating?.stars) return res.status(409).json({ success: false, message: 'قيّمت هذا الطلب مسبقاً' });
      order.ratings = order.ratings || {};
      order.ratings.clientRating = entry;
      await order.save();
      // تحديث متوسط الفني ذرياً: ratingSum/ratingCount
      await require('../models/User').findByIdAndUpdate(order.technicianId, {
        $inc: { 'technicianProfile.ratingCount': 1, 'technicianProfile.ratingSum': stars },
      });
      const tech = await require('../models/User').findById(order.technicianId)
        .select('technicianProfile.ratingSum technicianProfile.ratingCount').lean();
      const tp = tech?.technicianProfile;
      if (tp?.ratingCount) {
        await require('../models/User').findByIdAndUpdate(order.technicianId, {
          $set: { 'technicianProfile.ratingAverage': Math.round((tp.ratingSum / tp.ratingCount) * 10) / 10 },
        });
      }
      return res.json({ success: true, message: 'شكراً — سُجّل تقييمك للفني' });
    }
    if (order.technicianId?.toString() === uid) {
      if (order.ratings?.technicianRating?.stars) return res.status(409).json({ success: false, message: 'قيّمت هذا الطلب مسبقاً' });
      order.ratings = order.ratings || {};
      order.ratings.technicianRating = entry;
      await order.save();
      return res.json({ success: true, message: 'سُجّل تقييمك للعميل' });
    }
    return res.status(403).json({ success: false, message: 'لست طرفاً في هذا الطلب' });
  } catch (err) { next(err); }
};

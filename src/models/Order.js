const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    technicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    serviceCategory: { type: String, enum: ['solar', 'electricity', 'ac', 'plumbing'], required: true },
  isEmergency: { type: Boolean, default: false },
  scheduleType: { type: String, enum: ['now','scheduled'], default: 'now' },
  scheduledDateTime: { type: Date, default: null },
  orderNumber: { type: String, unique: true, sparse: true },
  attachments: {
    images: [{ type: String }],
    voiceNoteUrl: { type: String, default: null },
    videoUrl: { type: String, default: null },
    notes: { type: String, default: '' }
  },
    // لقطة المنطقة وقت الإنشاء — المطابقة الهرمية مع الفني تعتمد عليها
    city: { type: String, trim: true },      // المحافظة
    district: { type: String, trim: true },  // المديرية
    neighborhood: { type: String, trim: true }, // الحي / الشارع
    description: String,
    // GeoJSON Point — coordinates إلزامية هنا لذا default 'Point' آمن
    // (لا يُنشأ الكائن أبداً بدون إحداثيات من مسار إنشاء الطلب).
    location: {
      type: { type: String, enum: ['Point'], default: 'Point', required: true },
      coordinates: { type: [Number], required: true }, // [longitude, latitude] — خط الطول أولاً
      address: { type: String, trim: true },
      addressDetails: String, // توافقية مع الإصدارات السابقة
      landmark: String, // nearest famous landmark (offline-friendly addressing)
    },
    financials: {
      inspectionFee: { type: Number, required: true },
      additionalLaborFee: { type: Number, default: 0 },
      platformCommissionPercent: { type: Number, default: Number(process.env.DEFAULT_COMMISSION_PERCENT || 15), min: 15, max: 20 },
      platformCommissionAmount: { type: Number, default: 0 },
      technicianPayoutAmount: { type: Number, default: 0 },
      paymentStatus: { type: String, enum: ['pending', 'approved'], default: 'pending' },
      // مرحلة السند المعلق حالياً: كشف أولي أم أجور يد/قطع — يفصل الطابورين
      pendingProofType: { type: String, enum: ['none', 'inspection', 'labor'], default: 'none' },
      repairFee: { type: Number, default: 0 }, // أجور إصلاح إضافية يحددها الفني بعد المعاينة
      repairFeeStatus: { type: String, enum: ['none', 'pending_approval', 'approved', 'rejected'], default: 'none' },
      inspectionPaymentProofUrl: String,
      laborPaymentProofUrl: String,
      sparePartsReceiptUrls: { type: [String], default: [] },
    },
    otpVerificationCode: String,
    otpGeneratedAt: Date,
    status: {
      type: String,
      enum: [
        'pending_payment_proof',
        'payment_verifying',
        'searching_technician', // معتمد مالياً — جارٍ البحث عن فني مؤهل
        'assigned',
        'in_progress',
        'price_update_pending',
        'completed',
        'disputed',
        'cancelled',
      ],
      default: 'pending_payment_proof',
      index: true,
    },
    warrantyUntil: Date,
  warrantyDurationDays: { type: Number, default: 14 },
  warrantyValidUntil: Date,
  googleMapsUrl: { type: String, default: '' }, // OTP close time + 14 days
    paymentApprovedAt: Date, // ختم اعتماد الإدارة لسند الدفع
    voiceNoteUrl: String, // الملاحظة الصوتية المسجلة للعطل
    problemImages: { type: [String], default: [] }, // صور المشكلة
    // كرت الضمان الرقمي
    warranty: {
      isGuaranteed: { type: Boolean, default: false },
      durationDays: { type: Number, default: 14 },
      validUntil: Date,
      terms: String,
    },
    // التقييم المزدوج
    ratings: {
      clientRating: { stars: Number, comment: String, at: Date },     // العميل يقيّم الفني
      technicianRating: { stars: Number, comment: String, at: Date }, // الفني يقيّم العميل
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

orderSchema.index({ location: '2dsphere' });
// فهرس هرمي للمطابقة التلقائية: تخصص + محافظة + مديرية + حالة
orderSchema.index({ serviceCategory: 1, city: 1, district: 1, status: 1 }); // hierarchical

module.exports = mongoose.model('Order', orderSchema);

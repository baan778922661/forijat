const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    technicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    serviceCategory: { type: String, enum: ['solar', 'electricity', 'ac', 'plumbing'], required: true },
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
    warrantyUntil: Date, // OTP close time + 14 days
    paymentApprovedAt: Date, // ختم اعتماد الإدارة لسند الدفع
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

orderSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Order', orderSchema);

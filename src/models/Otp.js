const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    code: { type: String, required: true }, // 6 أرقام
    userName: String, // يظهر في شاشة الأكواد الحية باللوحة
    role: { type: String, enum: ['client', 'technician', 'admin', 'guest'], default: 'guest' },
    purpose: { type: String, enum: ['register', 'reset_password'], default: 'register' },
    expiresAt: { type: Date, required: true },
    isUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// انتهاء صلاحية ذاتي بعد 10 دقائق — MongoDB TTL
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);

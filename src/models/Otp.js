const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    code: { type: String, required: true }, // 6 أرقام
    purpose: { type: String, enum: ['register', 'reset_password'], default: 'register' },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }, // TTL: حذف تلقائي
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Otp', otpSchema);

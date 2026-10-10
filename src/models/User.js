const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['client', 'technician', 'admin'], required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, unique: true, required: true, index: true },
    passwordHash: { type: String, required: true },
    avatarUrl: String,
    isVerified: { type: Boolean, default: false },
    technicianProfile: {
      skills: { type: [String], enum: ['solar', 'electricity', 'ac', 'plumbing'], default: undefined },
      nationalIdImageUrl: String,
      ratingAverage: { type: Number, default: 5.0 },
      ratingCount: { type: Number, default: 0 },
      // ⚠️ لا قيم افتراضية هنا إطلاقاً — أي default على type يُنشئ كائن
      // GeoJSON ناقصاً { type: 'Point' } بدون coordinates فيصطدم بفهرس
      // 2dsphere (خطأ 16755). يُضبط الموقع فقط بإحداثيات GPS حقيقية
      // عبر PATCH /api/v1/auth/location (تمرر type و coordinates معاً).
      location: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] }, // [longitude, latitude]
      },
      isAvailable: { type: Boolean, default: true },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.index({ 'technicianProfile.location': '2dsphere' });

userSchema.statics.ensureGeoIndex = async function () {
  await this.syncIndexes();
};

module.exports = mongoose.model('User', userSchema);

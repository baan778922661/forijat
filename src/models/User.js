const mongoose = require('mongoose');

/**
 * نقطة GeoJSON كمستند فرعي مستقل مع default: undefined على الحقل
 * الحاوي — المفتاح لا يُنشأ إطلاقاً ما لم يُضبط صراحة بإحداثيات
 * حقيقية. هذا يقضي نهائياً على كل أشكال خطأ 16755:
 *  - { type: 'Point' } بدون coordinates   (default القديم)
 *  - { coordinates: [] } بدون type         (تهيئة المصفوفات التلقائية)
 *  - {} كائن فارغ                           (تهيئة الحقول المتداخلة)
 */
const geoPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'] },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: undefined,
      validate: {
        validator: (v) => v == null || (Array.isArray(v) && v.length === 2),
        message: 'coordinates يجب أن تكون [longitude, latitude]',
      },
    },
  },
  { _id: false }
);

/**
 * ملف الفني كمستند فرعي مستقل مع default: undefined — لا يُنشأ
 * إطلاقاً للعملاء والإداريين.
 */
const technicianProfileSchema = new mongoose.Schema(
  {
    skills: { type: [String], enum: ['solar', 'electricity', 'ac', 'plumbing'], default: [] },
    nationalIdImageUrl: String,
    ratingAverage: { type: Number, default: 5.0 },
    ratingCount: { type: Number, default: 0 },
    // ✅ يُضبط فقط عبر PUT /api/v1/technicians/status (زر Online)
    // أو PATCH /api/v1/auth/location — بكائن { type, coordinates } كامل
    location: { type: geoPointSchema, default: undefined },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['client', 'technician', 'admin'], required: true },
    name: { type: String, required: true, trim: true },
    // trim على مستوى الـ Schema: حماية مزدوجة من أي فراغات مخفية
    phone: { type: String, unique: true, required: true, index: true, trim: true },
    passwordHash: { type: String, required: true },
    avatarUrl: String,
    isVerified: { type: Boolean, default: false },
    // ✅ العميل والأدمن لا يحملان هذا الحقل أبداً
    technicianProfile: { type: technicianProfileSchema, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.index({ 'technicianProfile.location': '2dsphere' });

userSchema.statics.ensureGeoIndex = async function () {
  await this.syncIndexes();
};

module.exports = mongoose.model('User', userSchema);

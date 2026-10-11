const mongoose = require('mongoose');

/**
 * ملف التقني كمستند فرعي مستقل (Single Nested Subdocument)
 * مع default: undefined — فلا يُنشأ إطلاقاً للعملاء والإداريين،
 * ويقضي ذلك على خطأ 16755 (GeoJSON ناقص يصطدم بفهرس 2dsphere)
 * من جذوره: لا technicianProfile => لا location => لا تعارض مع الفهرس.
 */
const technicianProfileSchema = new mongoose.Schema(
  {
    skills: { type: [String], enum: ['solar', 'electricity', 'ac', 'plumbing'], default: [] },
    nationalIdImageUrl: String,
    ratingAverage: { type: Number, default: 5.0 },
    ratingCount: { type: Number, default: 0 },
    // ⚠️ بلا أي قيم افتراضية — يُضبط فقط بإحداثيات GPS حقيقية عبر
    // PATCH /api/v1/auth/location (تُمرَّر type و coordinates معاً).
    // أي default على type هنا يُنشئ { type: 'Point' } بدون إحداثيات
    // فيعيد خطأ 16755. لا نستخدم إحداثيات افتراضية أيضاً لأنها تُسنِد
    // للفني طلبات قريبة من نقطة وهمية عبر $geoNear.
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] }, // [longitude, latitude]
    },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['client', 'technician', 'admin'], required: true },
    name: { type: String, required: true, trim: true },
    // trim على مستوى الـ Schema أيضاً: حماية مزدوجة من أي مسار
    // كتابة مستقبلي قد يتجاوز تنظيف الـ controller
    phone: { type: String, unique: true, required: true, index: true, trim: true },
    passwordHash: { type: String, required: true },
    avatarUrl: String,
    isVerified: { type: Boolean, default: false },
    // ✅ default: undefined — العميل والأدمن لا يحملان هذا الحقل أبداً
    technicianProfile: { type: technicianProfileSchema, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.index({ 'technicianProfile.location': '2dsphere' });

userSchema.statics.ensureGeoIndex = async function () {
  await this.syncIndexes();
};

module.exports = mongoose.model('User', userSchema);

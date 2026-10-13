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
    nationalIdNumber: String,   // رقم الهوية
    idFrontImage: String,       // وجه البطاقة
    idBackImage: String,        // ظهر البطاقة
    personalPhoto: String,      // الصورة الشخصية
    emergencyPhone: String,     // رقم الطوارئ
    experienceYears: Number,    // سنوات الخبرة
    idCardUrl: String,        // صورة البطاقة الشخصية
    certificateUrl: String,   // شهادة الخبرة / الترخيص
    verificationStatus: { type: String, enum: ['pending_documents','under_review','approved','rejected','pending','verified'], default: 'pending_documents' },
    rejectionReason: String,
    ratingAverage: { type: Number, default: 5.0 },
    ratingCount: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 }, // مجموع النجوم — يُحتسب المتوسط منه ذرياً
    // ✅ يُضبط فقط عبر PUT /api/v1/technicians/status (زر Online)
    // أو PATCH /api/v1/auth/location — بكائن { type, coordinates } كامل
    location: { type: geoPointSchema, default: undefined },
isAvailable: { type: Boolean, default: true },
    schedule: { days: { type: [String], default: [] }, startTime: { type: String, default: '' }, endTime: { type: String, default: '' } },
    tier: { type: String, enum: ['bronze','silver','gold','platinum'], default: 'bronze' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['client', 'technician', 'admin'], required: true },
    name: { type: String, required: true, trim: true },
    age: { type: Number, min: 0 }, // ≥16 عميل / ≥18 فني (يُفرض في register)
    // trim على مستوى الـ Schema: حماية مزدوجة من أي فراغات مخفية
    // رقم يمني محلي 9 أرقام: يبدأ بـ 77/78/73/71/70 (يُخزَّن بدون رمز الدولة)
    phone: { type: String, unique: true, required: true, index: true, trim: true,
      match: [/^(77|78|73|71|70)\d{7}$/, 'رقم هاتف يمني غير صالح'] },
    passwordHash: { type: String, required: true },
    avatarUrl: String,
  sessions: [{ deviceName: { type: String, default: '' }, platform: { type: String, default: '' }, lastLoginAt: Date }],
  savedAddresses: [{
    title: { type: String, default: 'المنزل' },
    label: String, city: String, district: String,
    neighborhood: String, detailedAddress: String, googleMapsUrl: String,
    latitude: Number, longitude: Number,
    isDefault: { type: Boolean, default: false }
  }],
    isVerified: { type: Boolean, default: false },
    // الحقول الجغرافية
    city: { type: String, trim: true },           // المحافظة
    district: { type: String, trim: true },       // المديرية / المنطقة
    neighborhood: { type: String, trim: true },   // الحي
    detailedAddress: { type: String, trim: true },// العنوان التفصيلي / أقرب معلم
    // حقول الأمان
    isPhoneVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },   // false = محظور
    banReason: String,
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

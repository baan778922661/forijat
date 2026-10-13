const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { signToken } = require('../middleware/auth');
const Otp = require('../models/Otp');
const crypto = require('crypto');

function sanitize(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.passwordHash;
  return obj;
}

// POST /api/v1/auth/register
exports.register = async (req, res, next) => {
  try {
    const {
      role, name, password, skills, nationalIdImageUrl, age,
      city, district, neighborhood, detailedAddress,
      nationalIdNumber, emergencyPhone, experienceYears,
    } = req.body;

    let phone = String(req.body.phone || '').replace(/[\s-]/g, '').replace(/^(\+?00967|\+?967)/, '');
    if (!/^(77|78|73|71|70)\d{7}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'رقم هاتف يمني غير صالح — 9 أرقام تبدأ بـ 77/78/73/71/70' });
    }

    const ageNum = Number(age);
    const minAge = role === 'technician' ? 18 : 16;
    if (age !== undefined && (!Number.isFinite(ageNum) || ageNum < minAge)) {
      return res.status(400).json({ success: false, message: `الحد الأدنى للعمر ${minAge} سنة` });
    }
    if (!['client', 'technician'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be client or technician' });
    }
    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, message: 'name, phone and password are required' });
    }

    const exists = await User.findOne({ phone });
    if (exists) return res.status(409).json({ success: false, message: 'Phone already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const doc = {
      role,
      name,
      phone,
      passwordHash,
      age: Number.isFinite(ageNum) ? ageNum : undefined,
      city,
      district,
      neighborhood,
      detailedAddress,
    };

    if (role === 'technician') {
      doc.technicianProfile = {
        skills: skills || [],
        nationalIdImageUrl,
        isAvailable: true,
        nationalIdNumber,
        emergencyPhone,
        experienceYears: experienceYears ? Number(experienceYears) : 0,
      };
    }

    const user = await User.create(doc);
    if (role === 'technician') await Wallet.create({ technicianId: user._id });

    const token = signToken(user);
    res.status(201).json({ success: true, token, user: sanitize(user) });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/login
exports.login = async (req, res, next) => {
  try {
    const { password } = req.body;
    let phone = String(req.body.phone || '').replace(/[\s-]/g, '').replace(/^(\+?00967|\+?967)/, '');
    const user = await User.findOne({ phone });
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = signToken(user);
    try {
      user.sessions = [
        ...(user.sessions || []).slice(-4),
        {
          deviceName: req.body.deviceName || 'جهاز غير معروف',
          platform: req.body.platform || 'android',
          lastLoginAt: new Date(),
        },
      ];
      await user.save();
    } catch (_) {}
    res.json({ success: true, token, user: sanitize(user) });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/auth/me
exports.me = async (req, res) => res.json({ success: true, user: sanitize(req.user) });

// PATCH /api/v1/auth/location
exports.updateLocation = async (req, res, next) => {
  try {
    const { longitude, latitude } = req.body;
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      return res.status(400).json({ success: false, message: 'longitude/latitude numbers required' });
    }
    await User.findByIdAndUpdate(req.user._id, {
      $set: { 'technicianProfile.location': { type: 'Point', coordinates: [longitude, latitude] } },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/auth/availability
exports.setAvailability = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $set: { 'technicianProfile.isAvailable': !!req.body.isAvailable },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/request-otp
exports.requestOtp = async (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').replace(/[\s-]/g, '').replace(/^(\+?00967|\+?967)/, '').trim();
    if (!phone) return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب' });

    const code = crypto.randomInt(100000, 999999).toString();
    const owner = await User.findOne({ phone }).select('name role').lean();
    const isForgot = ['forgot_password', 'reset_password'].includes(req.body.purpose);

    await Otp.create({
      phone,
      code,
      userName: req.body.name || owner?.name || 'مستخدم فُرِجَت',
      role: req.body.role || owner?.role || 'guest',
      deliveryMethod: req.body.method === 'whatsapp' ? 'whatsapp' : 'sms',
      purpose: isForgot ? 'forgot_password' : 'register',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    res.json({ success: true, message: 'تم إنشاء رمز التحقق — تواصل مع الإدارة أو راجع اللوحة' });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/verify-otp
exports.verifyOtp = async (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').replace(/[\s-]/g, '').replace(/^(\+?00967|\+?967)/, '').trim();
    const code = String(req.body.code || '').trim();

    const otp = await Otp.findOneAndUpdate(
      { phone, code, isUsed: false, expiresAt: { $gt: new Date() } },
      { $set: { isUsed: true } },
      { new: true }
    );
    if (!otp) return res.status(400).json({ success: false, message: 'الرمز غير صحيح أو منتهي الصلاحية' });

    const user = await User.findOneAndUpdate({ phone }, { $set: { isPhoneVerified: true } }, { new: true });
    if (user) {
      const token = signToken(user);
      return res.json({
        success: true,
        message: 'تم التحقق بنجاح',
        purpose: otp.purpose,
        token,
        user: sanitize(user),
      });
    }
    res.json({ success: true, message: 'تم التحقق بنجاح', purpose: otp.purpose });
  } catch (err) {
    next(err);
  }
};

// PUT /api/v1/auth/change-password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة قصيرة (6 أحرف فأكثر)' });
    }
    const user = await User.findById(req.user._id);
    if (!(await bcrypt.compare(currentPassword || '', user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/reset-password
exports.resetPassword = async (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').replace(/[\s-]/g, '').replace(/^(\+?00967|\+?967)/, '').trim();
    const code = String(req.body.code || '').trim();
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف' });
    }

    // مطابقة الرمز الفعّال
    const otp = await Otp.findOneAndUpdate(
      { phone, code, expiresAt: { $gt: new Date() } },
      { $set: { isUsed: true } }
    );
    if (!otp) {
      return res.status(400).json({ success: false, message: 'رمز التحقق غير صحيح أو منتهي الصلاحية' });
    }

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ success: false, message: 'الحساب غير موجود' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    // إرجاع التوكن للدخول التلقائي في تطبيق فلاتر
    const token = signToken(user);
    res.json({
      success: true,
      message: 'تم تعيين كلمة المرور الجديدة بنجاح',
      token,
      user: sanitize(user),
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/auth/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'age', 'city', 'district', 'neighborhood', 'detailedAddress', 'avatarUrl'];
    const update = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true }).select('-passwordHash');
    res.json({ success: true, user: sanitize(user) });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/avatar (رفع الصورة الشخصية)
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'لم يتم إرفاق أي صورة' });
    }

    let avatarUrl = '';
    if (req.file.buffer) {
      avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (req.file.path) {
      avatarUrl = `/${req.file.path.replace(/\\/g, '/')}`;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatarUrl } },
      { new: true }
    ).select('-passwordHash');

    res.json({ success: true, message: 'تم تحديث الصورة الشخصية بنجاح', user: sanitize(user) });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/logout-others (تسجيل الخروج من باقي الأجهزة)
exports.logoutOthers = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (user && user.sessions) {
      user.sessions = user.sessions.slice(-1); // الإبقاء على الجلسة الحالية فقط
      await user.save();
    }
    res.json({ success: true, message: 'تم تسجيل الخروج من الأجهزة الأخرى بنجاح' });
  } catch (err) {
    next(err);
  }
};
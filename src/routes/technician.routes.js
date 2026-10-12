const router = require('express').Router();
const { protect, restrictTo, requireVerified } = require('../middleware/auth');
const upload = require('../middleware/upload');
const User = require('../models/User');
const { uploadBuffer } = require('../config/cloudinary');

router.use(protect, restrictTo('technician'));

/**
 * PUT /api/v1/technicians/status  (محمي بالتوثيق)
 * body: { isAvailable?: boolean, longitude?: number, latitude?: number }
 */
router.put('/status', requireVerified, async (req, res, next) => {
  try {
    const update = {};
    if (typeof req.body.isAvailable === 'boolean') {
      update['technicianProfile.isAvailable'] = req.body.isAvailable;
    }
    const lng = Number(req.body.longitude);
    const lat = Number(req.body.latitude);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
      update['technicianProfile.location'] = { type: 'Point', coordinates: [lng, lat] };
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ success: false, message: 'لا توجد بيانات صالحة للتحديث' });
    }
    await User.findByIdAndUpdate(req.user._id, { $set: update });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/technicians/profile
 * قبل التوثيق: التخصصات والوثائق قابلة للتعديل بحرية.
 * بعد التوثيق: تُقفل التخصصات وصور الهوية (حماية الهوية المعتمدة)،
 * ويبقى الهاتف والصورة الشخصية فقط قابلين للتعديل.
 */
router.put('/profile', async (req, res, next) => {
  try {
    const update = {};
    if (req.body.phone) update.phone = String(req.body.phone).trim();
    if (req.body.avatarUrl) update.avatarUrl = req.body.avatarUrl;
    if (!req.user.isVerified) {
      if (Array.isArray(req.body.skills)) update['technicianProfile.skills'] = req.body.skills;
      if (req.body.idCardUrl) update['technicianProfile.idCardUrl'] = req.body.idCardUrl;
      if (req.body.certificateUrl) update['technicianProfile.certificateUrl'] = req.body.certificateUrl;
      // إعادة الرفع بعد رفض تعيد الحساب للمراجعة
      if (req.body.idCardUrl || req.body.certificateUrl) {
        update['technicianProfile.verificationStatus'] = 'pending';
        update['technicianProfile.rejectionReason'] = undefined;
      }
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true }).select('-passwordHash');
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

/** POST /api/v1/technicians/documents/:kind  (kind = idCard | certificate) — رفع وثيقة */
router.post('/documents/:kind', upload.single('image'), async (req, res, next) => {
  try {
    if (req.user.isVerified) {
      return res.status(403).json({ success: false, message: 'الوثائق مقفلة بعد توثيق الحساب' });
    }
    if (!['idCard', 'certificate', 'idFront', 'idBack'].includes(req.params.kind)) {
      return res.status(400).json({ success: false, message: 'نوع وثيقة غير صالح' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'الصورة مطلوبة' });
    const { url } = await uploadBuffer(req.file.buffer, 'forijat/technician-docs');
    const FIELD_MAP = { idCard: 'idCardUrl', certificate: 'certificateUrl', idFront: 'idFrontImage', idBack: 'idBackImage' };
    const field = FIELD_MAP[req.params.kind];
    const user = await User.findByIdAndUpdate(req.user._id, {
      $set: {
        [`technicianProfile.${field}`]: url,
        'technicianProfile.verificationStatus': 'pending',
      },
      $unset: { 'technicianProfile.rejectionReason': '' },
    }, { new: true }).select('-passwordHash');
    res.json({ success: true, url, user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

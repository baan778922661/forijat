const router = require('express').Router();
const { protect, restrictTo, requireVerified } = require('../middleware/auth');
const upload = require('../middleware/upload');
const User = require('../models/User');
const { uploadBuffer } = require('../config/cloudinary');

router.use(protect, restrictTo('technician'));

/**
 * GET /api/v1/technicians/wallet
 * جلب أرصدة محفظة الفني (يحل مشكلة 404 في تطبيق الفني)
 */
router.get('/wallet', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('technicianProfile.wallet');
    const wallet = user?.technicianProfile?.wallet || {
      availableBalance: 0,
      pendingBalance: 0,
      lockedBalance: 0,
    };
    res.json({ success: true, wallet });
  } catch (err) {
    next(err);
  }
});

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
 */
router.put('/profile', async (req, res, next) => {
  try {
    const update = {};
    if (req.body.phone) update.phone = String(req.body.phone).trim();
    if (req.body.avatarUrl) update.avatarUrl = req.body.avatarUrl;
    
    if (!req.user.isVerified) {
      if (Array.isArray(req.body.skills)) update['technicianProfile.skills'] = req.body.skills;
      if (req.body.idCardUrl) {
        update['technicianProfile.idCardUrl'] = req.body.idCardUrl;
        update['technicianProfile.idFrontImage'] = req.body.idCardUrl;
        update['technicianProfile.documents.nationalIdFront'] = req.body.idCardUrl;
      }
      if (req.body.certificateUrl) {
        update['technicianProfile.certificateUrl'] = req.body.certificateUrl;
        update['technicianProfile.documents.certificate'] = req.body.certificateUrl;
      }
      if (req.body.idCardUrl || req.body.certificateUrl) {
        update['technicianProfile.verificationStatus'] = 'under_review';
        update['technicianProfile.rejectionReason'] = undefined;
      }
    }
    
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true }).select('-passwordHash');
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/technicians/documents
 * رفع حزمة الوثائق دفعة واحدة عند معالج التسجيل
 */
router.post(
  '/documents',
  upload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
    { name: 'certificate', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const update = {};

      if (req.files?.idFront?.[0]) {
        const { url } = await uploadBuffer(req.files.idFront[0].buffer, 'forijat/technician-docs');
        update['technicianProfile.idFrontImage'] = url;
        update['technicianProfile.idCardUrl'] = url;
        update['technicianProfile.documents.nationalIdFront'] = url;
      }
      if (req.files?.idBack?.[0]) {
        const { url } = await uploadBuffer(req.files.idBack[0].buffer, 'forijat/technician-docs');
        update['technicianProfile.idBackImage'] = url;
        update['technicianProfile.documents.nationalIdBack'] = url;
      }
      if (req.files?.certificate?.[0]) {
        const { url } = await uploadBuffer(req.files.certificate[0].buffer, 'forijat/technician-docs');
        update['technicianProfile.certificateUrl'] = url;
        update['technicianProfile.documents.certificate'] = url;
      }

      if (Object.keys(update).length > 0) {
        update['technicianProfile.verificationStatus'] = 'under_review';
        await User.findByIdAndUpdate(req.user._id, {
          $set: update,
          $unset: { 'technicianProfile.rejectionReason': '' },
        });
      }

      const user = await User.findById(req.user._id).select('-passwordHash');
      res.json({ success: true, message: 'تم رفع الوثائق بنجاح', user });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/technicians/documents/:kind
 * رفع وثيقة منفردة من شاشة "ملف الوثائق والتراخيص"
 * kind: idFront | idBack | certificate | idCard
 */
router.post('/documents/:kind', upload.single('image'), async (req, res, next) => {
  try {
    if (req.user.isVerified) {
      return res.status(403).json({ success: false, message: 'الوثائق مقفلة بعد توثيق الحساب' });
    }

    const validKinds = ['idCard', 'certificate', 'idFront', 'idBack', 'nationalIdFront', 'nationalIdBack'];
    if (!validKinds.includes(req.params.kind)) {
      return res.status(400).json({ success: false, message: 'نوع وثيقة غير صالح' });
    }

    if (!req.file) return res.status(400).json({ success: false, message: 'الصورة مطلوبة' });

    const { url } = await uploadBuffer(req.file.buffer, 'forijat/technician-docs');
    const update = {
      'technicianProfile.verificationStatus': 'under_review',
    };

    // توحيد الحقول البرمجية لتتطابق تلقائياً مع التطبيق ولوحة التحكم
    if (req.params.kind === 'idFront' || req.params.kind === 'idCard' || req.params.kind === 'nationalIdFront') {
      update['technicianProfile.idFrontImage'] = url;
      update['technicianProfile.idCardUrl'] = url;
      update['technicianProfile.documents.nationalIdFront'] = url;
    } else if (req.params.kind === 'idBack' || req.params.kind === 'nationalIdBack') {
      update['technicianProfile.idBackImage'] = url;
      update['technicianProfile.documents.nationalIdBack'] = url;
    } else if (req.params.kind === 'certificate') {
      update['technicianProfile.certificateUrl'] = url;
      update['technicianProfile.documents.certificate'] = url;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: update,
        $unset: { 'technicianProfile.rejectionReason': '' },
      },
      { new: true }
    ).select('-passwordHash');

    res.json({ success: true, url, user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
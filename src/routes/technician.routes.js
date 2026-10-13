const router = require('express').Router();
const { protect, restrictTo, requireVerified } = require('../middleware/auth');
const upload = require('../middleware/upload');
const User = require('../models/User');
const { uploadBuffer } = require('../config/cloudinary');

router.use(protect, restrictTo('technician'));

/**
 * GET /api/v1/technicians/wallet
 * جلب أرصدة محفظة الفني (المتاح، قيد التسوية، طلبات السحب قيد الإرسال)
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
      if (req.body.idCardUrl) update['technicianProfile.idCardUrl'] = req.body.idCardUrl;
      if (req.body.certificateUrl) update['technicianProfile.certificateUrl'] = req.body.certificateUrl;
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
 * رفع حزمة الوثائق دفعة واحدة عند التسجيل (وجه الهوية + ظهر الهوية + الشهادة)
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
      }
      if (req.files?.idBack?.[0]) {
        const { url } = await uploadBuffer(req.files.idBack[0].buffer, 'forijat/technician-docs');
        update['technicianProfile.idBackImage'] = url;
      }
      if (req.files?.certificate?.[0]) {
        const { url } = await uploadBuffer(req.files.certificate[0].buffer, 'forijat/technician-docs');
        update['technicianProfile.certificateUrl'] = url;
      }

      if (Object.keys(update).length > 0) {
        update['technicianProfile.verificationStatus'] = 'under_review';
        await User.findByIdAndUpdate(req.user._id, {
          $set: update,$unset: { 'technicianProfile.rejectionReason': '' },
        });
      }

      res.json({ success: true, message: 'تم رفع الوثائق بنجاح' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/technicians/documents/:kind (لرفع وثيقة منفردة من تبويب حسابي)
 */
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
    const FIELD_MAP = {
      idCard: 'idCardUrl',
      certificate: 'certificateUrl',
      idFront: 'idFrontImage',
      idBack: 'idBackImage',
    };
    const field = FIELD_MAP[req.params.kind];

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          [`technicianProfile.${field}`]: url,
          'technicianProfile.verificationStatus': 'under_review',
        },
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
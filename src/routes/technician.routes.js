const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/auth');
const User = require('../models/User');

router.use(protect, restrictTo('technician'));

/**
 * PUT /api/v1/technicians/status
 * تحديث حالة الفني (متصل/غير متصل) وموقعه اللحظي في نداء واحد.
 * body: { isAvailable?: boolean, longitude?: number, latitude?: number }
 */
router.put('/status', async (req, res, next) => {
  try {
    const update = {};
    if (typeof req.body.isAvailable === 'boolean') {
      update['technicianProfile.isAvailable'] = req.body.isAvailable;
    }
    const lng = Number(req.body.longitude);
    const lat = Number(req.body.latitude);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
      // GeoJSON القياسي: [longitude, latitude]
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

module.exports = router;

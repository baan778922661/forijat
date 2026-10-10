const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { signToken } = require('../middleware/auth');

// POST /api/v1/auth/register
exports.register = async (req, res, next) => {
  try {
    const { role, name, phone, password, skills, nationalIdImageUrl } = req.body;
    if (!['client', 'technician'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be client or technician' });
    }
    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, message: 'name, phone and password are required' });
    }

    const exists = await User.findOne({ phone });
    if (exists) return res.status(409).json({ success: false, message: 'Phone already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const doc = { role, name, phone, passwordHash };

    // ✅ technicianProfile يُنشأ حصراً للفنيين — العميل والأدمن لا يحملان
    // هذا الحقل أبداً. ولا نمرر location هنا إطلاقاً — يُضبط لاحقاً عبر
    // PATCH /api/v1/auth/location بإحداثيات حقيقية، حتى لا يُسنَد للفني
    // طلبٌ بناءً على موقع افتراضي خاطئ في $geoNear.
    if (role === 'technician') {
      doc.technicianProfile = {
        skills: skills || [],
        nationalIdImageUrl,
        isAvailable: true,
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
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = signToken(user);
    res.json({ success: true, token, user: sanitize(user) });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/auth/me
exports.me = async (req, res) => res.json({ success: true, user: req.user });

// PATCH /api/v1/auth/location  (technician updates GeoJSON location)
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

function sanitize(user) {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.passwordHash;
  return obj;
}

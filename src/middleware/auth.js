const jwt = require('jsonwebtoken');
const User = require('../models/User');

/** Verifies the Bearer JWT and attaches req.user */
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('-passwordHash');
    if (!user) return res.status(401).json({ success: false, message: 'User no longer exists' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/** Role guard: restrictTo('admin'), restrictTo('technician'), ... */
function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
}

/** يرفض الفني غير الموثق بـ 403 — للمسارات الحساسة (Online / nearby / accept) */
function requireVerified(req, res, next) {
  if (!req.user?.isVerified) {
    return res.status(403).json({ success: false, message: 'حسابك قيد المراجعة من الإدارة' });
  }
  next();
}

/** Shared-secret guard for internal cron endpoints (no user JWT needed) */
function cronAuth(req, res, next) {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, message: 'Invalid cron secret' });
  }
  next();
}

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
}

module.exports = { protect, restrictTo, requireVerified, cronAuth, signToken };

const PaymentMethod = require('../models/PaymentMethod');

// GET /api/v1/payment-methods  (active channels for clients/technicians)
exports.listActive = async (req, res, next) => {
  try {
    const methods = await PaymentMethod.find({ isActive: true }).lean();
    res.json({ success: true, methods });
  } catch (err) {
    next(err);
  }
};

// ===== Admin CRUD =====
exports.listAll = async (req, res, next) => {
  try {
    const methods = await PaymentMethod.find().sort('type name').lean();
    res.json({ success: true, methods });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const method = await PaymentMethod.create(req.body);
    res.status(201).json({ success: true, method });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const method = await PaymentMethod.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!method) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, method });
  } catch (err) {
    next(err);
  }
};

exports.toggleActive = async (req, res, next) => {
  try {
    const method = await PaymentMethod.findById(req.params.id);
    if (!method) return res.status(404).json({ success: false, message: 'Not found' });
    method.isActive = !method.isActive;
    await method.save();
    res.json({ success: true, method });
  } catch (err) {
    next(err);
  }
};

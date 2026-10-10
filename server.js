require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const connectDB = require('./src/config/db');

const app = express();

// ===== Global middleware =====
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' })); // bodies are small; images go through multer
app.use(morgan('tiny'));

// ===== Routes =====
app.use('/api/v1/health', require('./src/routes/health.routes'));
app.use('/api/v1/auth', require('./src/routes/auth.routes'));
app.use('/api/v1/payment-methods', require('./src/routes/paymentMethod.routes'));
app.use('/api/v1/orders', require('./src/routes/order.routes'));
app.use('/api/v1/wallet', require('./src/routes/wallet.routes'));
app.use('/api/v1/admin', require('./src/routes/admin.routes'));
app.use('/api/v1/internal', require('./src/routes/internal.routes'));

// ===== 404 & error handling =====
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Server error' });
});

// ===== Boot =====
const PORT = process.env.PORT || 10000;

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`Forijat API listening on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();

// Mongoose global safety: never allow buffered commands to hang silently
mongoose.set('strictQuery', true);

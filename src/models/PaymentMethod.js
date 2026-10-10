const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['wallet', 'bank', 'money_transfer'], required: true },
    name: { type: String, required: true }, // e-wallet / bank / transfer network name
    logoUrl: String,
    accountDetails: {
      accountNumber: String,
      accountName: String,
      extraNote: String,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);

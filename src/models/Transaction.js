const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    technicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    type: { type: String, enum: ['commission_deduction', 'earning', 'withdrawal'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending', index: true },
    payoutDetails: {
      methodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod' },
      recipientInfo: Object, // { name, walletPhone } or { iban, accountName } ...
      receiptImageUrl: String,
      referenceNumber: String,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('Transaction', transactionSchema);

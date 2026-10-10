const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

const PENDING_HOLD_MS = 2 * 60 * 60 * 1000; // 2-hour safety hold after OTP

/**
 * Credit a technician earning after OTP completion.
 * Fully atomic: single $inc, no read-then-save. Commission is deducted
 * BEFORE crediting, so the platform cut can never be skipped.
 */
async function creditEarning(technicianId, orderId, grossAmount, commissionPercent) {
  const commissionAmount = Math.round(grossAmount * (commissionPercent / 100) * 100) / 100;
  const payoutAmount = Math.round((grossAmount - commissionAmount) * 100) / 100;

  await Wallet.findOneAndUpdate(
    { technicianId },
    { $inc: { pendingBalance: payoutAmount }, $setOnInsert: { technicianId } },
    { upsert: true, new: true }
  );

  await Transaction.create([
    { technicianId, orderId, type: 'earning', amount: payoutAmount, status: 'pending' },
    { technicianId, orderId, type: 'commission_deduction', amount: commissionAmount, status: 'completed' },
  ]);

  return { commissionAmount, payoutAmount };
}

/**
 * Move matured earnings from pendingBalance -> availableBalance.
 * Called by /api/v1/internal/release-pending (external cron every ~10 min).
 * Each transition is conditional and atomic, so a double-run is harmless.
 */
async function releaseMaturedPending() {
  const cutoff = new Date(Date.now() - PENDING_HOLD_MS);
  const matured = await Transaction.find({ type: 'earning', status: 'pending', createdAt: { $lte: cutoff } }).limit(200);

  let released = 0;
  for (const tx of matured) {
    // 1) Mark the transaction completed only if it is still pending (atomic claim)
    const claimed = await Transaction.findOneAndUpdate(
      { _id: tx._id, status: 'pending' },
      { $set: { status: 'completed' } },
      { new: true }
    );
    if (!claimed) continue; // already handled by a concurrent run

    // 2) Move the money atomically
    await Wallet.findOneAndUpdate(
      { technicianId: tx.technicianId, pendingBalance: { $gte: tx.amount } },
      { $inc: { pendingBalance: -tx.amount, availableBalance: tx.amount } }
    );
    released += 1;
  }
  return { released };
}

/**
 * Daily instant payout request: available -> locked, plus a pending
 * withdrawal transaction the admin later fulfils manually.
 * The balance guard inside the query makes negative balances impossible.
 */
async function requestWithdrawal(technicianId, amount, methodId, recipientInfo) {
  if (!amount || amount <= 0) throw Object.assign(new Error('Invalid amount'), { statusCode: 400 });

  const wallet = await Wallet.findOneAndUpdate(
    { technicianId, availableBalance: { $gte: amount } },
    { $inc: { availableBalance: -amount, lockedBalance: amount } },
    { new: true }
  );
  if (!wallet) throw Object.assign(new Error('Insufficient available balance'), { statusCode: 400 });

  return Transaction.create({
    technicianId,
    type: 'withdrawal',
    amount,
    status: 'pending',
    payoutDetails: { methodId, recipientInfo },
  });
}

/**
 * Admin fulfils a withdrawal after making the real bank/wallet transfer:
 * attaches receipt + reference number, marks completed, unlocks the funds.
 */
async function completeWithdrawal(transactionId, { receiptImageUrl, referenceNumber }) {
  const tx = await Transaction.findOneAndUpdate(
    { _id: transactionId, type: 'withdrawal', status: 'pending' },
    { $set: { status: 'completed', 'payoutDetails.receiptImageUrl': receiptImageUrl, 'payoutDetails.referenceNumber': referenceNumber } },
    { new: true }
  );
  if (!tx) throw Object.assign(new Error('Withdrawal not found or already processed'), { statusCode: 404 });

  await Wallet.findOneAndUpdate(
    { technicianId: tx.technicianId, lockedBalance: { $gte: tx.amount } },
    { $inc: { lockedBalance: -tx.amount } }
  );
  return tx;
}

/** Admin rejects a withdrawal: funds return to availableBalance. */
async function rejectWithdrawal(transactionId) {
  const tx = await Transaction.findOneAndUpdate(
    { _id: transactionId, type: 'withdrawal', status: 'pending' },
    { $set: { status: 'rejected' } },
    { new: true }
  );
  if (!tx) throw Object.assign(new Error('Withdrawal not found or already processed'), { statusCode: 404 });

  await Wallet.findOneAndUpdate(
    { technicianId: tx.technicianId },
    { $inc: { lockedBalance: -tx.amount, availableBalance: tx.amount } }
  );
  return tx;
}

module.exports = {
  creditEarning,
  releaseMaturedPending,
  requestWithdrawal,
  completeWithdrawal,
  rejectWithdrawal,
  PENDING_HOLD_MS,
};

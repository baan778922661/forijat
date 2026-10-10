/**
 * Seed script: creates an admin account and sample payment channels.
 * Run once after deploy:  node seed/seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const PaymentMethod = require('../src/models/PaymentMethod');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const adminPhone = process.env.SEED_ADMIN_PHONE || '770000000';
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const exists = await User.findOne({ phone: adminPhone });
  if (!exists) {
    await User.create({
      role: 'admin',
      name: 'Forijat Admin',
      phone: adminPhone,
      passwordHash: await bcrypt.hash(adminPass, 10),
      isVerified: true,
    });
    console.log('Admin created:', adminPhone);
  }

  const channels = [
    { type: 'wallet', name: 'محفظة جوالي', accountDetails: { accountNumber: '777000000', accountName: 'Furijat Platform', extraNote: 'اذكر رقم الطلب في ملاحظة التحويل' } },
    { type: 'bank', name: 'بنك التضامن', accountDetails: { accountNumber: '0000-0000-0000', accountName: 'Furijat Platform' } },
    { type: 'money_transfer', name: 'شبكة الكريمي', accountDetails: { accountName: 'Furijat Platform', extraNote: 'حوالة باسم المنصة + الاسم الرباعي للمستلم' } },
  ];
  for (const c of channels) {
    await PaymentMethod.updateOne({ name: c.name }, { $setOnInsert: c }, { upsert: true });
  }
  console.log('Payment channels seeded');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  supportContacts: {
    whatsapp: { type: String, default: '+967770000000' },
    telegram: { type: String, default: '@furijat_support' },
    hotline:  { type: String, default: '8001000' },
    email:    { type: String, default: 'support@furijat.com' }
  },
  defaultInspectionFee: { type: Number, default: 2000 },
  warrantyRules: [{
    category: { type: String, enum: ['solar','electricity','ac','plumbing'] },
    defaultWarrantyDays: { type: Number, default: 14 }
  }]
}, { timestamps: true });
schema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};
module.exports = mongoose.model('SystemSettings', schema);

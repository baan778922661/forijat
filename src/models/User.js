const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['client', 'technician', 'admin'], required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, unique: true, required: true, index: true },
    passwordHash: { type: String, required: true },
    avatarUrl: String,
    isVerified: { type: Boolean, default: false },
    technicianProfile: {
      skills: { type: [String], enum: ['solar', 'electricity', 'ac', 'plumbing'], default: undefined },
      nationalIdImageUrl: String,
      ratingAverage: { type: Number, default: 5.0 },
      ratingCount: { type: Number, default: 0 },
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: undefined }, // [longitude, latitude]
      },
      isAvailable: { type: Boolean, default: true },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.index({ 'technicianProfile.location': '2dsphere' });

userSchema.statics.ensureGeoIndex = async function () {
  await this.syncIndexes();
};

module.exports = mongoose.model('User', userSchema);

const mongoose = require('mongoose');

/**
 * Connect to MongoDB Atlas (free tier friendly settings).
 * Keeps the pool small so we stay within M0 limits on Render free plan.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
  });

  console.log('MongoDB connected');

  // Ensure the geospatial index used by $geoNear exists
  const User = require('../models/User');
  await User.ensureGeoIndex();
}

module.exports = connectDB;

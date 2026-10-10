const User = require('../models/User');

/**
 * Find the nearest available, qualified technician using $geoNear
 * against the 2dsphere index on technicianProfile.location.
 *
 * @param {[number, number]} coordinates [longitude, latitude]
 * @param {string} skill  'solar' | 'electricity' | 'ac' | 'plumbing'
 * @param {number} maxDistanceMeters
 */
async function findNearestTechnician(coordinates, skill, maxDistanceMeters = 30000) {
  const results = await User.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates },
        distanceField: 'distanceMeters',
        maxDistance: maxDistanceMeters,
        spherical: true,
        query: {
          role: 'technician',
          isVerified: true,
          'technicianProfile.isAvailable': true,
          'technicianProfile.skills': skill,
        },
      },
    },
    { $limit: 5 },
    {
      $project: {
        name: 1,
        phone: 1,
        avatarUrl: 1,
        distanceMeters: 1,
        'technicianProfile.ratingAverage': 1,
        'technicianProfile.ratingCount': 1,
        'technicianProfile.skills': 1,
      },
    },
  ]);
  return results; // sorted by distance ascending
}

module.exports = { findNearestTechnician };

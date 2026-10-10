const router = require('express').Router();
const { cronAuth } = require('../middleware/auth');
const { releaseMaturedPending } = require('../services/wallet.service');

/**
 * POST /api/v1/internal/release-pending
 * Moves earnings whose 2-hour safety hold expired from pendingBalance
 * to availableBalance. Schedule via external cron (e.g. cron-job.org)
 * every 10 minutes with header: x-cron-secret: <CRON_SECRET>.
 */
router.post('/release-pending', cronAuth, async (req, res, next) => {
  try {
    const result = await releaseMaturedPending();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

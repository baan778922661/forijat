const router = require('express').Router();

/**
 * GET /api/v1/health
 * Ultra-light liveness probe for external cron pingers (cron-job.org,
 * UptimeRobot, Better Stack). Keeps the Render free-tier dyno awake:
 * schedule an HTTP GET every 10 minutes (Render sleeps after ~15 min idle).
 * Response is intentionally tiny for weak networks.
 */
router.get('/', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

module.exports = router;

require('dotenv').config();
const express = require('express');
const { handleGHLWebhook } = require('./services/ghlService');

// ── Feature Flag ──────────────────────────────────────────────────────────────
const WEBHOOK_SERVER_ENABLED = process.env.WEBHOOK_SERVER_ENABLED === 'true';

const app = express();
app.use(express.json());

// Webhook endpoint for GoHighLevel events (e.g. contact created, subscription renewed)
app.post('/webhook/ghl', async (req, res) => {
  const secret = req.headers['x-webhook-secret'];
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await handleGHLWebhook(req.body);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * Starts the webhook server.
 * Only active if WEBHOOK_SERVER_ENABLED=true in .env
 */
function startWebhookServer() {
  if (!WEBHOOK_SERVER_ENABLED) {
    console.log('[WebhookServer] ⚠️  Webhook server is DISABLED. Set WEBHOOK_SERVER_ENABLED=true to activate.');
    return null;
  }

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    console.log(`[WebhookServer] ✅ Listening on port ${PORT} for GHL webhooks.`);
  });

  return server;
}

module.exports = { app, startWebhookServer };


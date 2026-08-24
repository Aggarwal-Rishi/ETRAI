/**
 * ETRAI Webhook Dispatcher & Delivery Engine
 * Implements HMAC-SHA256 payload signing, exponential retries, 5s timeouts,
 * event routing (investigation.completed, investigation.failed, report.updated),
 * and transparent delivery status audit tracking.
 */

const crypto = require('crypto');
const fetch = require('node-fetch');

// In-memory webhooks registry per workspace (backed by database settings)
const webhookRegistry = new Map();

/**
 * Registers or updates a webhook endpoint for a workspace
 */
function registerWebhook({ workspaceId, url, events = ['investigation.completed', 'investigation.failed'], secret = null }) {
  if (!workspaceId || !url) throw new Error('Workspace ID and Webhook URL are required.');

  // Validate URL format
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Webhook URL must use HTTP or HTTPS protocol.');
    }
  } catch (e) {
    throw new Error(`Invalid webhook URL: ${e.message}`);
  }

  const webhookId = `wh_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const webhookSecret = secret || `whsec_${crypto.randomBytes(24).toString('hex')}`;

  const config = {
    id: webhookId,
    workspaceId,
    url,
    events: Array.isArray(events) ? events : [events],
    secret: webhookSecret,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    deliveryStats: {
      totalDispatched: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      lastDeliveredAt: null
    }
  };

  if (!webhookRegistry.has(workspaceId)) {
    webhookRegistry.set(workspaceId, []);
  }
  webhookRegistry.get(workspaceId).push(config);

  return {
    id: webhookId,
    workspaceId,
    url,
    events: config.events,
    secret: webhookSecret,
    createdAt: config.createdAt
  };
}

/**
 * Lists registered webhooks for a workspace
 */
function listWebhooks(workspaceId) {
  if (!workspaceId) return [];
  const list = webhookRegistry.get(workspaceId) || [];
  return list.map(w => ({
    id: w.id,
    workspaceId: w.workspaceId,
    url: w.url,
    events: w.events,
    status: w.status,
    createdAt: w.createdAt,
    deliveryStats: w.deliveryStats
  }));
}

/**
 * Deletes a registered webhook
 */
function deleteWebhook(webhookId, workspaceId) {
  if (!webhookRegistry.has(workspaceId)) return false;
  const list = webhookRegistry.get(workspaceId);
  const initialLen = list.length;
  const filtered = list.filter(w => w.id !== webhookId);
  webhookRegistry.set(workspaceId, filtered);
  return filtered.length < initialLen;
}

/**
 * Signs payload using HMAC-SHA256
 */
function generateWebhookSignature(payloadString, secret, timestamp = Date.now()) {
  const signaturePayload = `t=${timestamp}.${payloadString}`;
  const hash = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');
  return `t=${timestamp},v1=${hash}`;
}

/**
 * Dispatches a webhook event with signature and retries
 */
async function triggerWebhookEvent(eventType, payload = {}, workspaceId = null, options = {}) {
  const targetWebhooks = [];

  if (workspaceId && webhookRegistry.has(workspaceId)) {
    targetWebhooks.push(...webhookRegistry.get(workspaceId).filter(w => w.events.includes(eventType) && w.status === 'ACTIVE'));
  }

  // If mock/injected endpoint provided in options
  if (options.injectedWebhook) {
    targetWebhooks.push(options.injectedWebhook);
  }

  if (targetWebhooks.length === 0) {
    return {
      dispatchedCount: 0,
      deliveries: []
    };
  }

  const payloadString = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload
  });

  const deliveryResults = [];

  for (const hook of targetWebhooks) {
    const timestamp = Date.now();
    const signature = generateWebhookSignature(payloadString, hook.secret, timestamp);

    let attempts = 0;
    const maxAttempts = options.maxRetries || 3;
    let delivered = false;
    let lastError = null;
    let responseStatus = null;

    while (attempts < maxAttempts && !delivered) {
      attempts++;
      try {
        if (options.mockTransport) {
          const mockRes = await options.mockTransport({
            url: hook.url,
            body: payloadString,
            headers: {
              'Content-Type': 'application/json',
              'X-ETRAI-Event': eventType,
              'X-ETRAI-Signature': signature
            }
          });
          delivered = mockRes.ok !== false;
          responseStatus = mockRes.status || 200;
        } else {
          const res = await fetch(hook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-ETRAI-Event': eventType,
              'X-ETRAI-Signature': signature
            },
            body: payloadString,
            timeout: 5000
          });
          responseStatus = res.status;
          delivered = res.ok;
          if (!res.ok) {
            lastError = `HTTP ${res.status}: ${res.statusText}`;
          }
        }
      } catch (err) {
        lastError = err.message;
        delivered = false;
      }

      if (!delivered && attempts < maxAttempts) {
        // Exponential backoff wait (short in tests)
        await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempts - 1)));
      }
    }

    if (hook.deliveryStats) {
      hook.deliveryStats.totalDispatched++;
      if (delivered) {
        hook.deliveryStats.successfulDeliveries++;
        hook.deliveryStats.lastDeliveredAt = new Date().toISOString();
      } else {
        hook.deliveryStats.failedDeliveries++;
      }
    }

    deliveryResults.push({
      webhookId: hook.id,
      url: hook.url,
      event: eventType,
      delivered,
      attempts,
      responseStatus,
      error: delivered ? null : lastError
    });
  }

  return {
    dispatchedCount: deliveryResults.length,
    successfulCount: deliveryResults.filter(d => d.delivered).length,
    failedCount: deliveryResults.filter(d => !d.delivered).length,
    deliveries: deliveryResults
  };
}

module.exports = {
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  generateWebhookSignature,
  triggerWebhookEvent
};

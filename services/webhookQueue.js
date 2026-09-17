import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import crypto from 'crypto';
import Webhook from '../models/webhook.js';
import WebhookDelivery from '../models/webhookDelivery.js';

// Configuration
const isVercel = !!process.env.VERCEL;
const redisUrl = process.env.REDIS_URL;

let connection = null;
let webhookQueue = {
  add: async () => {
    console.log('Redis queue not configured or running in serverless mode. Skipping queue addition.');
  }
};
let webhookWorker = null;

if (!isVercel && redisUrl) {
  try {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    connection.on('error', (err) => {
      console.warn('⚠️ Webhook Redis connection warning:', err.message);
    });
    webhookQueue = new Queue('webhooks', { connection });
  } catch (err) {
    console.warn('⚠️ Failed to initialize Webhook BullMQ queue:', err.message);
  }
}

export { webhookQueue };

// Helper to sign payloads like GitHub does
function signPayload(secret, payloadBody) {
  if (!secret) return null;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadBody);
  return `sha256=${hmac.digest('hex')}`;
}

// Create the Worker (only process jobs if Redis connection exists and not in serverless)
if (connection && !isVercel) {
  try {
    webhookWorker = new Worker('webhooks', async (job) => {
      const { webhookId, event, payload } = job.data;
      
      const webhook = await Webhook.findById(webhookId);
      if (!webhook || !webhook.is_active) {
        return { skipped: true, reason: 'Webhook inactive or deleted' };
      }

      const payloadString = JSON.stringify(payload);
      const signature = signPayload(webhook.secret, payloadString);
      
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'GitHub-Clone-Hookshot/1.0',
        'X-GitHub-Event': event,
        'X-GitHub-Delivery': job.id,
      };
      
      if (signature) {
        headers['X-Hub-Signature-256'] = signature;
      }

      const startTime = Date.now();
      let success = false;
      let statusCode = 0;
      let responseBody = '';
      let responseHeaders = {};

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payloadString,
          // Abort after 10 seconds
          signal: AbortSignal.timeout(10000)
        });
        
        statusCode = response.status;
        success = response.ok;
        
        // We only store the first 1KB of the response body to avoid blowing up DB
        const rawText = await response.text();
        responseBody = rawText.substring(0, 1000);
        
        // Convert Headers object to a plain object
        for (const [key, value] of response.headers.entries()) {
          responseHeaders[key] = value;
        }
      } catch (error) {
        success = false;
        responseBody = error.message;
      }

      const durationMs = Date.now() - startTime;

      // Log the delivery
      await WebhookDelivery.create({
        webhook: webhook._id,
        event,
        payload,
        request_headers: headers,
        response_headers: responseHeaders,
        response_body: responseBody,
        status_code: statusCode,
        success,
        duration_ms: durationMs
      });

      if (!success) {
        throw new Error(`Webhook delivery failed with status ${statusCode}`);
      }

      return { success: true };
    }, { 
      connection,
      concurrency: 5 // Process up to 5 webhooks concurrently
    });

    webhookWorker.on('failed', (job, err) => {
      console.error(`❌ Webhook Job ${job.id} failed:`, err.message);
    });

    webhookWorker.on('completed', (job) => {
      console.log(`✅ Webhook Job ${job.id} delivered successfully.`);
    });
    webhookWorker.on('error', (err) => {
      console.warn(`⚠️ Webhook Worker error:`, err.message);
    });
  } catch (err) {
    console.warn('⚠️ Could not start Webhook Worker:', err.message);
  }
}

export { webhookWorker };

/**
 * Dispatch a webhook event to all active webhooks for a repository
 */
export async function dispatchRepoEvent(repositoryId, event, payload) {
  try {
    const webhooks = await Webhook.find({ repository: repositoryId, is_active: true, events: event });
    
    for (const webhook of webhooks) {
      await webhookQueue.add('deliver-webhook', {
        webhookId: webhook._id,
        event,
        payload
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false
      });
    }
  } catch (err) {
    console.error('Error dispatching webhook event:', err);
  }
}

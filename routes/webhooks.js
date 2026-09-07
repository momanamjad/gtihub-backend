import express from 'express';
import Webhook from '../models/webhook.js';
import WebhookDelivery from '../models/webhookDelivery.js';
import Repository from '../models/repository.js';
import { auth } from '../middleware/auth.js';
import { successResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { webhookQueue } from '../services/webhookQueue.js';

const router = express.Router({ mergeParams: true });

// Middleware to check repository access
const checkRepoAccess = async (req, res, next) => {
  const repo = await Repository.findById(req.params.id);
  if (!repo || repo.is_deleted) {
    return next(new AppError('Repository not found', 404));
  }
  if (repo.owner.toString() !== req.user.id.toString()) {
    return next(new AppError('Unauthorized', 403));
  }
  req.repo = repo;
  next();
};

// GET all webhooks for a repo
router.get('/', auth, checkRepoAccess, asyncHandler(async (req, res) => {
  const webhooks = await Webhook.find({ repository: req.params.id }).sort('-created_at');
  successResponse(res, webhooks);
}));

// POST create a webhook
router.post('/', auth, checkRepoAccess, asyncHandler(async (req, res) => {
  const { url, secret, events, is_active } = req.body;
  if (!url) throw new AppError('Webhook URL is required', 400);

  const webhook = new Webhook({
    repository: req.params.id,
    url,
    secret,
    events: events || ['push'],
    is_active: is_active !== false
  });

  await webhook.save();
  successResponse(res, webhook, 'Webhook created successfully', 201);
}));

// GET a specific webhook with its recent deliveries
router.get('/:webhookId', auth, checkRepoAccess, asyncHandler(async (req, res) => {
  const webhook = await Webhook.findOne({ _id: req.params.webhookId, repository: req.params.id });
  if (!webhook) throw new AppError('Webhook not found', 404);

  const deliveries = await WebhookDelivery.find({ webhook: webhook._id })
    .sort('-delivered_at')
    .limit(50);

  successResponse(res, { ...webhook.toObject(), deliveries });
}));

// PUT update a webhook
router.put('/:webhookId', auth, checkRepoAccess, asyncHandler(async (req, res) => {
  const { url, secret, events, is_active } = req.body;
  
  const webhook = await Webhook.findOneAndUpdate(
    { _id: req.params.webhookId, repository: req.params.id },
    { url, secret, events, is_active },
    { new: true, runValidators: true }
  );

  if (!webhook) throw new AppError('Webhook not found', 404);
  successResponse(res, webhook, 'Webhook updated successfully');
}));

// DELETE a webhook
router.delete('/:webhookId', auth, checkRepoAccess, asyncHandler(async (req, res) => {
  const webhook = await Webhook.findOneAndDelete({ _id: req.params.webhookId, repository: req.params.id });
  if (!webhook) throw new AppError('Webhook not found', 404);
  
  // Optionally delete deliveries too, or leave them for history
  await WebhookDelivery.deleteMany({ webhook: req.params.webhookId });
  
  successResponse(res, null, 'Webhook deleted successfully');
}));

// POST redeliver a specific delivery
router.post('/:webhookId/deliveries/:deliveryId/redeliver', auth, checkRepoAccess, asyncHandler(async (req, res) => {
  const delivery = await WebhookDelivery.findOne({ _id: req.params.deliveryId, webhook: req.params.webhookId });
  if (!delivery) throw new AppError('Delivery not found', 404);

  // Re-queue the exact same payload
  await webhookQueue.add('deliver-webhook', {
    webhookId: req.params.webhookId,
    event: delivery.event,
    payload: delivery.payload
  });

  successResponse(res, null, 'Webhook redelivery scheduled');
}));

// POST ping a webhook (send a dummy event to test)
router.post('/:webhookId/ping', auth, checkRepoAccess, asyncHandler(async (req, res) => {
  const webhook = await Webhook.findOne({ _id: req.params.webhookId, repository: req.params.id });
  if (!webhook) throw new AppError('Webhook not found', 404);

  await webhookQueue.add('deliver-webhook', {
    webhookId: webhook._id,
    event: 'ping',
    payload: { zen: 'Practicality beats purity.', hook_id: webhook._id }
  });

  successResponse(res, null, 'Ping event scheduled');
}));

export default router;

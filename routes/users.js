import express from 'express';
import { validateQuery } from '../utils/validate.js';
import { paginationValidator } from '../utils/validators.js';
import { successResponse, paginatedResponse } from '../utils/responseFormatter.js';
import { asyncHandler } from '../utils/errorHandler.js';
import { auth } from '../middleware/auth.js';
import * as userService from '../services/userService.js';
import PullRequest from '../models/pullRequest.js';
import Repository from '../models/repository.js';

const router = express.Router();

/**
 * @swagger
 * /users/{id}/follow:
 *   post:
 *     summary: Toggle follow user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.post('/:id/follow', auth, asyncHandler(async (req, res) => {
  const result = await userService.followUser(req.user.id, req.params.id);
  successResponse(res, result);
}));

/**
 * @swagger
 * /users/{id}/followers:
 *   get:
 *     summary: Get user followers
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 10 }
 */
router.get('/:id/followers', validateQuery(paginationValidator), asyncHandler(async (req, res) => {
  const { followers, total } = await userService.getFollowers(req.params.id, req.query);
  paginatedResponse(res, followers, req.query.page, req.query.limit, total, 'Followers retrieved');
}));

/**
 * @swagger
 * /users/{id}/following:
 *   get:
 *     summary: Get users that user is following
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 10 }
 */
router.get('/:id/following', validateQuery(paginationValidator), asyncHandler(async (req, res) => {
  const { following, total } = await userService.getFollowing(req.params.id, req.query);
  paginatedResponse(res, following, req.query.page, req.query.limit, total, 'Following retrieved');
}));

/**
 * @swagger
 * /users/notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 10 }
 */
router.get('/notifications', auth, validateQuery(paginationValidator), asyncHandler(async (req, res) => {
  const { notifications, total, unread } = await userService.getNotifications(req.user.id, req.query);
  res.status(200).json({
    success: true,
    message: 'Notifications retrieved',
    data: notifications,
    pagination: {
      page: req.query.page,
      limit: req.query.limit,
      total,
      pages: Math.ceil(total / req.query.limit),
    },
    unread,
  });
}));

/**
 * @swagger
 * /users/notifications/{notificationId}:
 *   put:
 *     summary: Mark notification as read
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema: { type: string }
 */

router.get('/pulls', auth, asyncHandler(async (req, res) => {
  const userRepos = await Repository.find({ owner: req.user.id, is_deleted: false });
  const repoIds = userRepos.map(r => r._id);
  
  const prs = await PullRequest.find({
    $or: [
      { repository: { $in: repoIds } },
      { author: req.user.id }
    ]
  })
  .populate('author', 'login avatar_url')
  .populate({
    path: 'repository',
    select: 'name owner',
    populate: { path: 'owner', select: 'login' }
  })
  .sort('-createdAt');
  
  successResponse(res, prs);
}));

router.put('/notifications/:notificationId', auth, asyncHandler(async (req, res) => {
  const notification = await userService.markNotificationAsRead(req.params.notificationId, req.user.id);
  successResponse(res, notification, 'Notification marked as read');
}));

router.get('/search', asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 10 } = req.query;
  const { users, total } = await userService.searchUsers({ q, page, limit });
  successResponse(res, { users, total });
}));

router.get('/activity/feed', auth, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const result = await userService.getActivityFeed(req.user.id, { page, limit });
  successResponse(res, result, 'Activity feed retrieved');
}));

export default router;

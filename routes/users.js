import express from 'express';
import { validateQuery } from '../utils/validate.js';
import { paginationValidator } from '../utils/validators.js';
import { successResponse, paginatedResponse } from '../utils/responseFormatter.js';
import { asyncHandler } from '../utils/errorHandler.js';
import { auth } from '../middleware/auth.js';
import * as userService from '../services/userService.js';

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
router.put('/notifications/:notificationId', auth, asyncHandler(async (req, res) => {
  const notification = await userService.markNotificationAsRead(req.params.notificationId);
  successResponse(res, notification, 'Notification marked as read');
}));

export default router;

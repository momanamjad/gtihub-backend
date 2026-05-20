import express from 'express';
import { validateRequest, validateQuery } from '../utils/validate.js';
import {
  registerValidator,
  loginValidator,
  changePasswordValidator,
  updateProfileValidator,
  searchValidator,
} from '../utils/validators.js';
import { successResponse, paginatedResponse } from '../utils/responseFormatter.js';
import { asyncHandler } from '../utils/errorHandler.js';
import { auth } from '../middleware/auth.js';
import * as authService from '../services/authService.js';
import * as userService from '../services/userService.js';

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [login, email, password]
 *             properties:
 *               login: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 */
router.post('/register', validateRequest(registerValidator), asyncHandler(async (req, res) => {
  const { token, user } = await authService.register(req.validated);
  successResponse(res, { token, user }, 'User registered successfully', 201);
}));

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 */
router.post('/login', validateRequest(loginValidator), asyncHandler(async (req, res) => {
  const { token, user } = await authService.login(req.validated);
  successResponse(res, { token, user }, 'Login successful');
}));

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 */
router.get('/me', auth, asyncHandler(async (req, res) => {
  const user = await authService.getUserProfile(req.user.id);
  successResponse(res, user);
}));

/**
 * @swagger
 * /auth/user/{username}:
 *   get:
 *     summary: Get public user profile
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema: { type: string }
 */
router.get('/user/:username', asyncHandler(async (req, res) => {
  const { user, repos, pins } = await userService.getUserPublicProfile(req.params.username);
  successResponse(res, { user, repos, pins });
}));

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword: { type: string }
 *               newPassword: { type: string }
 */
router.post('/change-password', auth, validateRequest(changePasswordValidator), asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.validated);
  successResponse(res, result);
}));

/**
 * @swagger
 * /auth/search:
 *   get:
 *     summary: Search users
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 10 }
 */
router.get('/search', validateQuery(searchValidator), asyncHandler(async (req, res) => {
  const { users, total } = await userService.searchUsers(req.query);
  paginatedResponse(res, users, req.query.page, req.query.limit, total, 'Users found');
}));

/**
 * @swagger
 * /auth/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               bio: { type: string }
 *               avatar_url: { type: string }
 */
router.put('/profile', auth, validateRequest(updateProfileValidator), asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.validated);
  successResponse(res, user);
}));

export default router;

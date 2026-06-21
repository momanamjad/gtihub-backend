import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import User from '../models/user.js';
import { validateRequest, validateQuery } from '../utils/validate.js';
import {
  registerValidator,
  loginValidator,
  changePasswordValidator,
  updateProfileValidator,
  searchValidator,
} from '../utils/validators.js';
import { successResponse, paginatedResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import * as authService from '../services/authService.js';
import * as userService from '../services/userService.js';

const router = express.Router();

const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

const clearTokenCookies = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('accessToken', { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax' });
  res.clearCookie('refreshToken', { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax' });
};

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
  const { accessToken, refreshToken, user } = await authService.register(req.validated);
  setTokenCookies(res, accessToken, refreshToken);
  successResponse(res, { accessToken, refreshToken, user }, 'User registered successfully', 201);
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
  const { accessToken, refreshToken, user } = await authService.login(req.validated);
  setTokenCookies(res, accessToken, refreshToken);
  successResponse(res, { accessToken, refreshToken, user }, 'Login successful');
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
router.get('/user/:username', optionalAuth, asyncHandler(async (req, res) => {
  const { user, repos, pins, starredRepos } = await userService.getUserPublicProfile(req.params.username, req.user?.id);
  successResponse(res, { user, repos, pins, starredRepos });
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

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    throw new AppError('No refresh token, authorization denied', 401);
  }
  
  const userId = await authService.verifyRefreshToken(refreshToken);
  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = authService.generateTokens(userId);
  
  setTokenCookies(res, newAccessToken, newRefreshToken);
  successResponse(res, { accessToken: newAccessToken, refreshToken: newRefreshToken }, 'Token refreshed successfully');
}));

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 */
router.post('/logout', asyncHandler(async (req, res) => {
  clearTokenCookies(res);
  successResponse(res, null, 'Logged out successfully');
}));

/**
 * @swagger
 * /auth/google-signin:
 *   post:
 *     summary: Sign in or register with Google
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential: { type: string }
 */
router.post('/google-signin', asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    throw new AppError('Google credential token is required', 400);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.warn('WARNING: GOOGLE_CLIENT_ID is not configured in environment variables.');
  }

  let payload;
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch (err) {
    throw new AppError('Invalid Google credential token: ' + err.message, 400);
  }

  if (!payload || !payload.email) {
    throw new AppError('Failed to retrieve user email from Google credential', 400);
  }

  const { email, name, picture } = payload;

  let user = await User.findOne({ email });

  if (!user) {
    // Generate unique login username
    let baseLogin = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!baseLogin) baseLogin = 'user';
    
    let login = baseLogin;
    let counter = 1;
    while (await User.findOne({ login })) {
      login = `${baseLogin}${counter}`;
      counter++;
    }

    // Generate a secure random password for DB requirement
    const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).toUpperCase().slice(-10);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(randomPassword, salt);

    user = new User({
      login,
      email,
      password: hashedPassword,
      name: name || login,
      avatar_url: picture || '',
    });
    await user.save();
  }

  const { accessToken, refreshToken } = authService.generateTokens(user.id);
  const userObj = user.toObject();
  delete userObj.password;

  setTokenCookies(res, accessToken, refreshToken);
  successResponse(res, { accessToken, refreshToken, user: userObj }, 'Google sign-in successful');
}));

export default router;

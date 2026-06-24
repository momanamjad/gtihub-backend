import express from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import User from '../models/user.js';
import { sendResetEmail } from '../services/emailService.js';
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
    maxAge: 15 * 60 * 1000 // 15 minutes
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
  
  // Verify the incoming refresh token matches the one stored in the DB
  const user = await User.findById(userId);
  if (!user || user.refreshToken !== refreshToken) {
    throw new AppError('Invalid refresh token, authorization denied', 401);
  }

  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = authService.generateTokens(userId);
  
  // Save new refresh token to DB (rotating/invalidating the old one)
  user.refreshToken = newRefreshToken;
  await user.save();

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
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    try {
      const userId = await authService.verifyRefreshToken(refreshToken);
      await User.findByIdAndUpdate(userId, { refreshToken: "" });
    } catch (err) {
      // Ignore token verification errors during logout
    }
  }
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
    return res.status(503).json({ message: "Google Sign-In is not configured" });
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
    let attempts = 0;
    while (await User.findOne({ login })) {
      if (++attempts > 10) {
        login = `user_${crypto.randomBytes(8).toString('hex')}`;
      } else {
        login = `${baseLogin}${Math.floor(Math.random() * 9999)}`;
      }
    }

    // Generate a secure random password for DB requirement
    const randomPassword = crypto.randomBytes(32).toString('hex');
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
  user.refreshToken = refreshToken;
  await user.save();
  
  const userObj = user.toObject();
  delete userObj.password;

  setTokenCookies(res, accessToken, refreshToken);
  successResponse(res, { accessToken, refreshToken, user: userObj }, 'Google sign-in successful');
}));

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 */
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  const user = await User.findOne({ email });
  if (!user) {
    // Return success to prevent email enumeration attacks
    return successResponse(res, null, 'If that email address exists in our database, we will send a password reset link.');
  }

  // Generate secure random reset token
  const resetToken = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

  await user.save();

  // Create reset link
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  await sendResetEmail(user.email, resetUrl);

  successResponse(res, null, 'If that email address exists in our database, we will send a password reset link.');
}));

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using the secure token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string }
 */
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    throw new AppError('Token and password are required', 400);
  }

  // Verify password requirements
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new AppError('Password must be at least 8 characters long and contain at least one uppercase letter and one number', 400);
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    throw new AppError('Password reset token is invalid or has expired', 400);
  }

  // Update password and hash it
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(password, salt);
  
  // Clear reset token fields
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;

  await user.save();

  successResponse(res, null, 'Password reset successful. You can now log in.');
}));

export default router;

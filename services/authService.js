import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import { AppError } from '../utils/errorHandler.js';

const JWT_SECRET = process.env.JWT_SECRET || 'github_clone_default_jwt_secret_fallback_key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'github_clone_default_jwt_refresh_secret_fallback_key';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ WARNING: JWT_SECRET must be set in environment variables. Using fallback secret.');
}
if (!process.env.JWT_REFRESH_SECRET) {
  console.warn('⚠️ WARNING: JWT_REFRESH_SECRET must be set in environment variables. Using fallback secret.');
}

export const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { user: { id: userId } },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { user: { id: userId } },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

export const register = async ({ login, email, password }) => {
  let user = await User.findOne({ $or: [{ email }, { login }] });
  if (user) throw new AppError('User already exists', 400);

  // Create user first to get _id, then hash and save once
  user = new User({ login, email, password });
  const hashedPassword = await bcrypt.hash(password, 10); // skip genSalt — pass rounds directly
  user.password = hashedPassword;

  const { accessToken, refreshToken } = generateTokens(user._id.toString());
  user.refreshToken = refreshToken;

  await user.save(); // single save (was two saves before)

  const userObj = user.toObject();
  delete userObj.password;
  return { accessToken, refreshToken, user: userObj };
};

export const login = async ({ email, password }) => {
  let user = await User.findOne({ email }).select('+password');
  if (!user) throw new AppError('Invalid Credentials', 400);

  // Check if account is locked
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / (60 * 1000));
    throw new AppError(`Account is temporarily locked. Try again in ${minutesLeft} minutes.`, 423);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    // Use targeted update to avoid full-document save overhead
    const newAttempts = (user.loginAttempts || 0) + 1;
    if (newAttempts >= 5) {
      await User.findByIdAndUpdate(user._id, {
        loginAttempts: 0,
        lockUntil: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes lockout
      });
    } else {
      await User.findByIdAndUpdate(user._id, { loginAttempts: newAttempts });
    }
    throw new AppError('Invalid Credentials', 400);
  }

  const { accessToken, refreshToken } = generateTokens(user.id);

  // Use targeted update instead of full user.save() — avoids Mongoose full-doc validation overhead
  await User.findByIdAndUpdate(user._id, {
    refreshToken,
    loginAttempts: 0,
    $unset: { lockUntil: 1 },
  });

  const userObj = user.toObject();
  delete userObj.password;
  return { accessToken, refreshToken, user: userObj };
};

export const changePassword = async (userId, { oldPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError('User not found', 404);

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) throw new AppError('Invalid current password', 400);

  user.password = await bcrypt.hash(newPassword, 10); // skip genSalt
  await user.save();

  return { message: 'Password updated successfully' };
};

export const getUserProfile = async (userId) => {
  const user = await User.findById(userId).select('-password').lean();
  if (!user) throw new AppError('User not found', 404);
  return user;
};

export const verifyRefreshToken = async (token) => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    return decoded.user.id;
  } catch (err) {
    throw new AppError('Refresh token is not valid or expired', 401);
  }
};

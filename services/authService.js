import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import { AppError } from '../utils/errorHandler.js';

export const register = async ({ login, email, password }) => {
  let user = await User.findOne({ $or: [{ email }, { login }] });
  if (user) throw new AppError('User already exists', 400);

  user = new User({ login, email, password });
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(password, salt);
  await user.save();

  const token = jwt.sign({ user: { id: user.id } }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return { token, user: { id: user._id, login: user.login, email: user.email } };
};

export const login = async ({ email, password }) => {
  let user = await User.findOne({ email });
  if (!user) throw new AppError('Invalid Credentials', 400);

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new AppError('Invalid Credentials', 400);

  const token = jwt.sign({ user: { id: user.id } }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return { token, user: { id: user._id, login: user.login, email: user.email } };
};

export const changePassword = async (userId, { oldPassword, newPassword }) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) throw new AppError('Invalid current password', 400);

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();

  return { message: 'Password updated successfully' };
};

export const getUserProfile = async (userId) => {
  const user = await User.findById(userId).select('-password');
  if (!user) throw new AppError('User not found', 404);
  return user;
};

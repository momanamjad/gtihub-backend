import User from '../models/user.js';
import Repository from '../models/repository.js';
import Pin from '../models/pin.js';
import Follower from '../models/follower.js';
import Notification from '../models/notification.js';
import { AppError } from '../utils/errorHandler.js';

export const getUserPublicProfile = async (username) => {
  const user = await User.findOne({ login: username }).select('-password');
  if (!user) throw new AppError('User not found', 404);

  const repos = await Repository.find({ owner: user._id, is_deleted: false });
  const pins = await Pin.find({ user: user._id }).populate('repository').sort('order');
  
  return { user, repos, pins };
};

export const updateProfile = async (userId, { name, bio, avatar_url }) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  if (name) user.name = name;
  if (bio) user.bio = bio;
  if (avatar_url) user.avatar_url = avatar_url;
  
  await user.save();
  return user;
};

export const searchUsers = async ({ q, page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;
  const users = await User.find({ login: { $regex: q, $options: 'i' } })
    .select('login name avatar_url followers_count public_repos_count')
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments({ login: { $regex: q, $options: 'i' } });

  return { users, total };
};

export const followUser = async (userId, userToFollowId) => {
  if (userId === userToFollowId) throw new AppError('Cannot follow yourself', 400);

  const existing = await Follower.findOne({ follower: userId, following: userToFollowId });
  
  if (existing) {
    await existing.deleteOne();
    await User.findByIdAndUpdate(userToFollowId, { $inc: { followers_count: -1 } });
    await User.findByIdAndUpdate(userId, { $inc: { following_count: -1 } });
    return { message: 'Unfollowed' };
  }

  await new Follower({ follower: userId, following: userToFollowId }).save();
  await User.findByIdAndUpdate(userToFollowId, { $inc: { followers_count: 1 } });
  await User.findByIdAndUpdate(userId, { $inc: { following_count: 1 } });

  // Create notification
  await new Notification({
    user: userToFollowId,
    actor: userId,
    type: 'follow',
    message: `Someone followed you`,
  }).save();

  return { message: 'Followed' };
};

export const getFollowers = async (userId, { page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;
  const followers = await Follower.find({ following: userId })
    .populate('follower', 'login name avatar_url')
    .skip(skip)
    .limit(limit);

  const total = await Follower.countDocuments({ following: userId });

  return { followers, total };
};

export const getFollowing = async (userId, { page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;
  const following = await Follower.find({ follower: userId })
    .populate('following', 'login name avatar_url')
    .skip(skip)
    .limit(limit);

  const total = await Follower.countDocuments({ follower: userId });

  return { following, total };
};

export const getNotifications = async (userId, { page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;
  const notifications = await Notification.find({ user: userId })
    .populate('actor', 'login avatar_url')
    .sort('-created_at')
    .skip(skip)
    .limit(limit);

  const total = await Notification.countDocuments({ user: userId });
  const unread = await Notification.countDocuments({ user: userId, isRead: false });

  return { notifications, total, unread };
};

export const markNotificationAsRead = async (notificationId) => {
  const notification = await Notification.findByIdAndUpdate(
    notificationId,
    { isRead: true },
    { new: true }
  );

  if (!notification) throw new AppError('Notification not found', 404);
  return notification;
};

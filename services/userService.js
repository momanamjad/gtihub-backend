import User from '../models/user.js';
import Repository from '../models/repository.js';
import Pin from '../models/pin.js';
import Star from '../models/star.js';
import Follower from '../models/follower.js';
import Notification from '../models/notification.js';
import Contribution from '../models/contribution.js';
import { AppError } from '../utils/errorHandler.js';

export const recordContribution = async (userId, type, repositoryId = null, extraData = {}) => {
  try {
    const contribution = new Contribution({
      user: userId,
      type,
      repository: repositoryId,
      count: 1,
      ...extraData
    });
    await contribution.save();
  } catch (err) {
    console.error('Error recording contribution:', err);
  }
};

export const getUserPublicProfile = async (username, viewerId) => {
  const user = await User.findOne({ login: username }).select('-password');
  if (!user) throw new AppError('User not found', 404);

  const isOwner = viewerId && viewerId === user._id.toString();

  const repoQuery = { owner: user._id, is_deleted: false };
  if (!isOwner) {
    repoQuery.visibility = 'public';
  }

  const repos = await Repository.find(repoQuery).populate('owner', 'login name avatar_url');
  let pins = await Pin.find({ user: user._id }).populate('repository').sort('order');
  
  if (!isOwner) {
    pins = pins.filter(pin => pin.repository && !pin.repository.is_deleted && pin.repository.visibility === 'public');
  }

  // Aggregate contributions in the last 365 days
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);

  const contributions = await Contribution.aggregate([
    {
      $match: {
        user: user._id,
        created_at: { $gte: oneYearAgo }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$created_at" }
        },
        count: { $sum: "$count" }
      }
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
        count: 1
      }
    },
    {
      $sort: { date: 1 }
    }
  ]);
  const userObj = user.toObject();
  userObj.contributions = contributions;
  
  let isFollowing = false;
  if (viewerId) {
    const followRecord = await Follower.findOne({ follower: viewerId, following: user._id });
    isFollowing = !!followRecord;
  }
  userObj.isFollowing = isFollowing;
  userObj._id = user._id.toString();

  const stars = await Star.find({ user: user._id }).populate({
    path: 'repository',
    populate: { path: 'owner', select: 'login name avatar_url' }
  });
  const starredRepos = stars.map(s => s.repository).filter(r => r && !r.is_deleted);
  
  return { user: userObj, repos, pins, starredRepos };
};

export const updateProfile = async (userId, updates) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const allowedFields = ['name', 'bio', 'avatar_url', 'company', 'location', 'blog', 'pronouns', 'status'];
  allowedFields.forEach(field => {
    if (updates[field] !== undefined) {
      user[field] = updates[field];
    }
  });

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

  // Record contribution
  await recordContribution(userId, 'user_followed', null, { targetUser: userToFollowId });

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

export const getActivityFeed = async (userId, { page = 1, limit = 20 }) => {
  const skip = (page - 1) * limit;

  // Get followed users
  const followedRelations = await Follower.find({ follower: userId }).select('following');
  const followedUserIds = followedRelations.map(r => r.following);

  // Include user's own activity as well
  const targetUserIds = [userId, ...followedUserIds];

  // Retrieve contributions
  const contributions = await Contribution.find({ user: { $in: targetUserIds } })
    .populate('user', 'login avatar_url')
    .populate({
      path: 'repository',
      select: 'name owner visibility description forks_count stars_count language',
      populate: { path: 'owner', select: 'login avatar_url' }
    })
    .populate('targetUser', 'login avatar_url')
    .sort('-created_at')
    .skip(skip)
    .limit(limit);

  const total = await Contribution.countDocuments({ user: { $in: targetUserIds } });

  return { feed: contributions, total };
};

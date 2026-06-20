import express from 'express';
import PullRequest from '../models/pullRequest.js';
import Repository from '../models/repository.js';
import Notification from '../models/notification.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { recordContribution } from '../services/userService.js';
import Comment from '../models/comment.js';

const router = express.Router({ mergeParams: true });

// List all PRs for a repository
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && (!req.user || repo.owner.toString() !== req.user.id.toString())) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const pr = await PullRequest.find({ repository: repoId })
    .populate('author', 'login avatar_url')
    .sort('-createdAt');
  
  successResponse(res, pr);
}));

// Create a Pull Request
router.post('/', auth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  const { title, description, sourceBranch, targetBranch } = req.body;
  
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && repo.owner.toString() !== req.user.id.toString()) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const pr = new PullRequest({
    repository: repoId,
    title,
    description,
    author: req.user.id,
    sourceBranch: sourceBranch || 'main',
    targetBranch: targetBranch || 'main'
  });

  await pr.save();
  
  // Record contribution
  await recordContribution(req.user.id, 'pr_created', repoId);
  
  // Trigger notification to repository owner and watchers
  const notifyUsers = new Set();
  if (repo.owner.toString() !== req.user.id) {
    notifyUsers.add(repo.owner.toString());
  }
  if (repo.watchers && repo.watchers.length > 0) {
    repo.watchers.forEach(watcherId => {
      if (watcherId.toString() !== req.user.id) {
        notifyUsers.add(watcherId.toString());
      }
    });
  }

  for (const targetUserId of notifyUsers) {
    try {
      await new Notification({
        user: targetUserId,
        actor: req.user.id,
        type: 'pr',
        repository: repoId,
        message: `opened a pull request: "${pr.title}" in ${repo.name}`
      }).save();
    } catch (notifErr) {
      console.error('Failed to create PR notification:', notifErr);
    }
  }

  successResponse(res, pr, 'Pull Request created successfully', 201);
}));

// Merge a Pull Request
router.post('/:id/merge', auth, asyncHandler(async (req, res) => {
  const { repoId, id } = req.params;
  
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== req.user.id) throw new AppError('Unauthorized to merge', 401);

  const pr = await PullRequest.findById(id);
  if (!pr) throw new AppError('Pull Request not found', 404);
  if (pr.status !== 'open') throw new AppError('Pull Request is already ' + pr.status, 400);

  pr.status = 'merged';
  await pr.save();

  // Trigger notification to PR author and watchers
  const notifyUsers = new Set();
  if (pr.author.toString() !== req.user.id) {
    notifyUsers.add(pr.author.toString());
  }
  if (repo.watchers && repo.watchers.length > 0) {
    repo.watchers.forEach(watcherId => {
      if (watcherId.toString() !== req.user.id) {
        notifyUsers.add(watcherId.toString());
      }
    });
  }

  for (const targetUserId of notifyUsers) {
    try {
      await new Notification({
        user: targetUserId,
        actor: req.user.id,
        type: 'merge',
        repository: repoId,
        message: `merged pull request: "${pr.title}"`
      }).save();
    } catch (notifErr) {
      console.error('Failed to create merge notification:', notifErr);
    }
  }

  successResponse(res, pr, 'Pull Request merged successfully');
}));

// GET comments for a pull request
router.get('/:id/comments', optionalAuth, asyncHandler(async (req, res) => {
  const comments = await Comment.find({ pullRequest: req.params.id })
    .populate('author', 'login avatar_url')
    .sort('createdAt');
  successResponse(res, comments);
}));

// POST a new comment on a pull request
router.post('/:id/comments', auth, asyncHandler(async (req, res) => {
  const { body } = req.body;
  if (!body) throw new AppError('Comment body is required', 400);

  const comment = new Comment({
    body,
    author: req.user.id,
    pullRequest: req.params.id
  });

  await comment.save();
  await comment.populate('author', 'login avatar_url');
  successResponse(res, comment, 'Comment posted successfully', 201);
}));

export default router;

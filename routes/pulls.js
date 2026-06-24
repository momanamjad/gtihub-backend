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

  pr.number = await PullRequest.countDocuments({ repository: repoId }) + 1;
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

  // Merge block guard: check if any review has CHANGES_REQUESTED
  const activeReviews = pr.reviews || [];
  const hasChangesRequested = activeReviews.some(r => r.state === 'CHANGES_REQUESTED');
  if (hasChangesRequested) {
    throw new AppError('Cannot merge: Changes are requested by a reviewer. Please resolve comments first.', 400);
  }

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

// POST a line-level inline comment on a PR
router.post('/:id/line-comments', auth, asyncHandler(async (req, res) => {
  const { filePath, lineNumber, body } = req.body;
  if (!filePath || !lineNumber || !body) {
    throw new AppError('filePath, lineNumber, and body are required', 400);
  }

  const pr = await PullRequest.findById(req.params.id);
  if (!pr) throw new AppError('Pull Request not found', 404);

  const commentObj = {
    filePath,
    lineNumber,
    author: req.user.id,
    body,
    created_at: new Date()
  };

  pr.comments = pr.comments || [];
  pr.comments.push(commentObj);
  await pr.save();

  // Populate author info
  const populatedPr = await PullRequest.findById(req.params.id)
    .populate('comments.author', 'login avatar_url');

  const savedComment = populatedPr.comments[populatedPr.comments.length - 1];

  successResponse(res, savedComment, 'Line comment posted successfully', 201);
}));

// GET line-level inline comments for a PR
router.get('/:id/line-comments', optionalAuth, asyncHandler(async (req, res) => {
  const pr = await PullRequest.findById(req.params.id)
    .populate('comments.author', 'login avatar_url');
  if (!pr) throw new AppError('Pull Request not found', 404);
  successResponse(res, pr.comments || []);
}));

// POST submit or update review state on a PR
router.post('/:id/reviews', auth, asyncHandler(async (req, res) => {
  const { state, body } = req.body;
  if (!state || !['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'].includes(state)) {
    throw new AppError('Valid review state is required (APPROVED, CHANGES_REQUESTED, COMMENTED)', 400);
  }
  
  const pr = await PullRequest.findById(req.params.id);
  if (!pr) throw new AppError('Pull Request not found', 404);

  if (pr.repository.toString() !== req.params.repoId) {
    throw new AppError('Pull Request not found', 404);
  }

  // Find if user already reviewed
  const existingIndex = pr.reviews.findIndex(r => r.reviewer.toString() === req.user.id.toString());
  const reviewData = {
    reviewer: req.user.id,
    state,
    body: body || "",
    submitted_at: new Date()
  };

  if (existingIndex > -1) {
    pr.reviews[existingIndex] = reviewData;
  } else {
    pr.reviews.push(reviewData);
  }

  await pr.save();
  
  const populated = await PullRequest.findById(req.params.id)
    .populate('reviews.reviewer', 'login avatar_url');

  successResponse(res, populated.reviews, 'Review submitted successfully');
}));

// GET reviews for a PR
router.get('/:id/reviews', optionalAuth, asyncHandler(async (req, res) => {
  const pr = await PullRequest.findById(req.params.id)
    .populate('reviews.reviewer', 'login avatar_url');
  if (!pr) throw new AppError('Pull Request not found', 404);

  if (pr.repository.toString() !== req.params.repoId) {
    throw new AppError('Pull Request not found', 404);
  }

  successResponse(res, pr.reviews || []);
}));

export default router;

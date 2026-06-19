import express from 'express';
import Discussion from '../models/discussion.js';
import Repository from '../models/repository.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';

const router = express.Router({ mergeParams: true });

// Get discussions for a repository
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  const { category } = req.query;

  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  const query = { repository: repoId };
  if (category) query.category = category;

  const discussions = await Discussion.find(query)
    .populate('creator', 'login avatar_url')
    .populate('replies.author', 'login avatar_url')
    .sort('-createdAt');

  successResponse(res, discussions);
}));

// Create a discussion
router.post('/', auth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  const { title, body, category } = req.body;

  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  const discussion = new Discussion({
    repository: repoId,
    creator: req.user.id,
    title,
    body,
    category: category || 'general'
  });

  await discussion.save();
  successResponse(res, discussion, 'Discussion created successfully', 201);
}));

// Toggle upvote
router.post('/:id/upvote', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const discussion = await Discussion.findById(id);
  if (!discussion) throw new AppError('Discussion not found', 404);

  const index = discussion.upvotes.indexOf(userId);
  if (index === -1) {
    discussion.upvotes.push(userId);
  } else {
    discussion.upvotes.splice(index, 1);
  }

  await discussion.save();
  successResponse(res, discussion, index === -1 ? 'Upvoted' : 'Upvote removed');
}));

// Add a reply
router.post('/:id/replies', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;

  const discussion = await Discussion.findById(id);
  if (!discussion) throw new AppError('Discussion not found', 404);

  discussion.replies.push({
    author: req.user.id,
    body
  });

  await discussion.save();
  
  const updated = await Discussion.findById(id)
    .populate('creator', 'login avatar_url')
    .populate('replies.author', 'login avatar_url');

  successResponse(res, updated, 'Reply added successfully');
}));

// Mark reply as accepted answer
router.put('/:id/replies/:replyId/answer', auth, asyncHandler(async (req, res) => {
  const { repoId, id, replyId } = req.params;

  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  
  // Only repository owner can mark answers
  if (repo.owner.toString() !== req.user.id) {
    throw new AppError('Only the repository owner can mark an answer', 403);
  }

  const discussion = await Discussion.findById(id);
  if (!discussion) throw new AppError('Discussion not found', 404);

  let replyFound = false;
  discussion.replies = discussion.replies.map(r => {
    if (r._id.toString() === replyId) {
      r.isAnswer = !r.isAnswer;
      replyFound = true;
    }
    return r;
  });

  if (!replyFound) throw new AppError('Reply not found', 404);

  await discussion.save();
  
  const updated = await Discussion.findById(id)
    .populate('creator', 'login avatar_url')
    .populate('replies.author', 'login avatar_url');

  successResponse(res, updated, 'Reply answer status toggled successfully');
}));

export default router;

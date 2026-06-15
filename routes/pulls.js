import express from 'express';
import PullRequest from '../models/pullRequest.js';
import Repository from '../models/repository.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';

const router = express.Router({ mergeParams: true });

// List all PRs for a repository
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  const prs = await PullRequest.find({ repository: repoId })
    .populate('author', 'login avatar_url')
    .sort('-createdAt');
  
  successResponse(res, prs);
}));

// Create a Pull Request
router.post('/', auth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  const { title, description, sourceBranch, targetBranch } = req.body;
  
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  const pr = new PullRequest({
    repository: repoId,
    title,
    description,
    author: req.user.id,
    sourceBranch: sourceBranch || 'main',
    targetBranch: targetBranch || 'main'
  });

  await pr.save();
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

  successResponse(res, pr, 'Pull Request merged successfully');
}));

export default router;

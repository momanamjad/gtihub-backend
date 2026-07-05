import express from 'express';
import PullRequest from '../models/pullRequest.js';
import Repository from '../models/repository.js';
import Notification from '../models/notification.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { recordContribution } from '../services/userService.js';
import Comment from '../models/comment.js';
import { triggerWorkflowRun } from '../utils/workflowHelper.js';
import FileNode from '../models/fileNode.js';
import { checkBranchesForConflicts, generateConflictContent } from '../utils/conflictHelper.js';

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
  
  if (!title?.trim()) {
    return res.status(400).json({ message: 'PR title is required' });
  }

  const src = sourceBranch || 'main';
  const tgt = targetBranch || 'main';
  if (src === tgt) {
    return res.status(400).json({ message: 'Source and target branches must be different' });
  }

  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  // Prevent duplicate PRs for the same source/target branches
  const existingPR = await PullRequest.findOne({
    repository: repoId,
    sourceBranch: src,
    targetBranch: tgt,
    status: 'open'
  });
  if (existingPR) {
    return res.status(400).json({ message: 'A pull request for these branches already exists.' });
  }

  if (repo.visibility === 'private' && repo.owner.toString() !== req.user.id.toString()) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const { hasConflicts, conflictedFiles } = await checkBranchesForConflicts(repoId, src, tgt);

  const pr = new PullRequest({
    repository: repoId,
    title,
    description,
    author: req.user.id,
    sourceBranch: src,
    targetBranch: tgt,
    hasConflicts,
    conflictedFiles
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
  if (repo.owner.toString() !== req.user.id) throw new AppError('Unauthorized to merge', 403);

  const pr = await PullRequest.findById(id);
  if (!pr) throw new AppError('Pull Request not found', 404);
  if (pr.status !== 'open') throw new AppError('Pull Request is already ' + pr.status, 400);

  // Merge block guard: check if any review has CHANGES_REQUESTED
  const activeReviews = pr.reviews || [];
  const hasChangesRequested = activeReviews.some(r => r.state === 'CHANGES_REQUESTED');
  if (hasChangesRequested) {
    throw new AppError('Cannot merge: Changes are requested by a reviewer. Please resolve comments first.', 400);
  }

  // Conflict block guard: check if PR has conflicts
  if (pr.hasConflicts) {
    throw new AppError('Cannot merge: This branch has conflicts that must be resolved first.', 400);
  }

  // ─── File Synchronization (Actual DB Merge) ──────────────────────
  const sourceQuery = { repository: repoId };
  if (pr.sourceBranch === 'main') {
    sourceQuery.$or = [{ branch: 'main' }, { branch: { $exists: false } }, { branch: null }];
  } else {
    sourceQuery.branch = pr.sourceBranch;
  }
  const sourceNodes = await FileNode.find(sourceQuery).lean();

  const targetQuery = { repository: repoId };
  if (pr.targetBranch === 'main') {
    targetQuery.$or = [{ branch: 'main' }, { branch: { $exists: false } }, { branch: null }];
  } else {
    targetQuery.branch = pr.targetBranch;
  }
  
  // Wipe out the old target branch tree
  await FileNode.deleteMany(targetQuery);

  // Copy new tree nodes across
  const clonedNodes = sourceNodes.map(node => {
    const { _id, createdAt, updatedAt, ...rest } = node;
    return {
      ...rest,
      branch: pr.targetBranch
    };
  });

  if (clonedNodes.length > 0) {
    await FileNode.insertMany(clonedNodes);
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

  // Trigger automated Actions CI/CD workflow run for the merged branch
  await triggerWorkflowRun(repoId, pr.targetBranch || 'main');

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
  const commentDoc = pr.comments.create(commentObj);
  pr.comments.push(commentDoc);
  await pr.save();

  // Populate author info
  const populatedPr = await PullRequest.findById(req.params.id)
    .populate('comments.author', 'login avatar_url');

  const savedComment = populatedPr.comments.id(commentDoc._id);

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

// GET conflicted files and their contents with markers
router.get('/:id/conflicts', auth, asyncHandler(async (req, res) => {
  const pr = await PullRequest.findById(req.params.id);
  if (!pr) throw new AppError('Pull Request not found', 404);

  const { repoId } = req.params;
  const buildQuery = (branchName, filePath) => {
    const query = { repository: repoId, path: filePath, type: 'file' };
    if (branchName === 'main') {
      query.$or = [{ branch: 'main' }, { branch: { $exists: false } }, { branch: null }];
    } else {
      query.branch = branchName;
    }
    return query;
  };

  const conflictsData = [];

  for (const filePath of pr.conflictedFiles) {
    const sourceNode = await FileNode.findOne(buildQuery(pr.sourceBranch, filePath)).lean();
    const targetNode = await FileNode.findOne(buildQuery(pr.targetBranch, filePath)).lean();

    const targetContent = targetNode?.content || "";
    const sourceContent = sourceNode?.content || "";

    const contentWithMarkers = generateConflictContent(
      targetContent,
      sourceContent,
      pr.targetBranch,
      pr.sourceBranch
    );

    conflictsData.push({
      path: filePath,
      content: contentWithMarkers,
      targetContent,
      sourceContent
    });
  }

  successResponse(res, conflictsData);
}));

// POST resolve conflicts and commit to source branch
router.post('/:id/resolve', auth, asyncHandler(async (req, res) => {
  const pr = await PullRequest.findById(req.params.id);
  if (!pr) throw new AppError('Pull Request not found', 404);
  if (pr.status !== 'open') throw new AppError('Pull Request is already ' + pr.status, 400);

  const { repoId } = req.params;
  const { resolvedFiles } = req.body; // e.g. { "src/App.jsx": "resolved code..." }

  if (!resolvedFiles || typeof resolvedFiles !== 'object') {
    throw new AppError('resolvedFiles object is required', 400);
  }

  const buildUpdateQuery = (branchName, filePath) => {
    const query = { repository: repoId, path: filePath, type: 'file' };
    if (branchName === 'main') {
      query.$or = [{ branch: 'main' }, { branch: { $exists: false } }, { branch: null }];
    } else {
      query.branch = branchName;
    }
    return query;
  };

  // For each resolved file, update its content in the source branch
  for (const [filePath, content] of Object.entries(resolvedFiles)) {
    // Verify it was actually a conflicted file
    if (!pr.conflictedFiles.includes(filePath)) continue;

    // Update FileNode in sourceBranch
    const sourceNode = await FileNode.findOne(buildUpdateQuery(pr.sourceBranch, filePath));
    if (sourceNode) {
      sourceNode.content = content;
      sourceNode.lastCommitMessage = 'Resolve merge conflicts';
      sourceNode.lastCommitAuthor = req.user?.login || 'system';
      sourceNode.lastCommitDate = new Date();
      await sourceNode.save();
    }
  }

  // Re-run conflict check
  const { hasConflicts, conflictedFiles } = await checkBranchesForConflicts(repoId, pr.sourceBranch, pr.targetBranch);
  
  pr.hasConflicts = hasConflicts;
  pr.conflictedFiles = conflictedFiles;
  await pr.save();

  successResponse(res, pr, 'Conflicts resolved and committed successfully');
}));

export default router;

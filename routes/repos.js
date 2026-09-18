import express from 'express';
import { validateRequest, validateQuery } from '../utils/validate.js';
import { createRepoValidator, updateRepoValidator, paginationValidator } from '../utils/validators.js';
import { successResponse, paginatedResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import * as repoService from '../services/repoService.js';
import crypto from 'crypto';
import Comment from '../models/comment.js';
import Repository from '../models/repository.js';
import ProjectCard from '../models/project.js';
import WorkflowRun from '../models/workflowRun.js';
import Secret from '../models/secret.js';
import FileNode from '../models/fileNode.js';
import User from '../models/user.js';
import BranchProtection from '../models/branchProtection.js';
import { recordContribution, clearUserProfileCache } from '../services/userService.js';
import { triggerWorkflowRun } from '../utils/workflowHelper.js';
import { dispatchRepoEvent } from '../services/webhookQueue.js';

const IV_LENGTH = 16;

function getEncryptionKey() {
  const key = process.env.SECRET_ENCRYPTION_KEY;
  if (!key) throw new Error('SECRET_ENCRYPTION_KEY environment variable must be set');
  return key;
}

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(getEncryptionKey().padEnd(32).substring(0, 32));
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

const router = express.Router();

/**
 * @swagger
 * /repos:
 *   post:
 *     summary: Create a new repository
 *     tags: [Repositories]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               language: { type: string }
 *               visibility: { type: string, enum: [public, private] }
 */
router.post('/', auth, validateRequest(createRepoValidator), asyncHandler(async (req, res) => {
  // Note: profile README detection (name === login) is handled in repoService.createRepository
  // which has access to the real user.login from DB. The JWT only contains { id }.
  const repo = await repoService.createRepository(req.user.id, req.validated);
  clearUserProfileCache();
  successResponse(res, repo, 'Repository created successfully', 201);
}));

/**
 * @swagger
 * /repos:
 *   get:
 *     summary: Get user's repositories
 *     tags: [Repositories]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 10 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: '-created_at' }
 */
router.get('/', auth, validateQuery(paginationValidator), asyncHandler(async (req, res) => {
  const { repos, total } = await repoService.getUserRepositories(req.user.id, req.query);
  paginatedResponse(res, repos, req.query.page, req.query.limit, total);
}));

/**
 * @swagger
 * /repos/public/explore:
 *   get:
 *     summary: Explore public repositories
 *     tags: [Repositories]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 10 }
 *       - in: query
 *         name: language
 *         schema: { type: string }
 */
router.get('/public/explore', validateQuery(paginationValidator), asyncHandler(async (req, res) => {
  const { repos, total } = await repoService.getPublicRepositories(req.query);
  paginatedResponse(res, repos, req.query.page, req.query.limit, total);
}));

/**
 * @swagger
 * /repos/{id}:
 *   get:
 *     summary: Get repository details
 *     tags: [Repositories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const repo = await repoService.getRepositoryById(req.params.id, req.user?.id);
  successResponse(res, repo);
}));

/**
 * @swagger
 * /repos/{id}:
 *   put:
 *     summary: Update repository
 *     tags: [Repositories]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               visibility: { type: string }
 */
router.put('/:id', auth, validateRequest(updateRepoValidator), asyncHandler(async (req, res) => {
  const repo = await repoService.updateRepository(req.params.id, req.user.id, req.validated);
  successResponse(res, repo);
}));

/**
 * @swagger
 * /repos/{id}:
 *   delete:
 *     summary: Delete repository
 *     tags: [Repositories]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const result = await repoService.deleteRepository(req.params.id, req.user.id);
  successResponse(res, result);
}));

/**
 * @swagger
 * /repos/{id}/star:
 *   post:
 *     summary: Toggle star on repository
 *     tags: [Repositories]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.post('/:id/star', auth, asyncHandler(async (req, res) => {
  const result = await repoService.toggleStar(req.params.id, req.user.id);
  successResponse(res, result);
}));

/**
 * @swagger
 * /repos/{id}/pin:
 *   post:
 *     summary: Toggle pin on repository
 *     tags: [Repositories]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.post('/:id/pin', auth, asyncHandler(async (req, res) => {
  const result = await repoService.togglePin(req.params.id, req.user.id);
  successResponse(res, result);
}));

router.post('/:id/watch', auth, asyncHandler(async (req, res) => {
  const repo = await Repository.findById(req.params.id);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  const userId = req.user.id;
  const watchIndex = (repo.watchers || []).findIndex(id => id.toString() === userId.toString());

  if (watchIndex === -1) {
    repo.watchers.push(userId);
    repo.watchers_count += 1;
  } else {
    repo.watchers.splice(watchIndex, 1);
    repo.watchers_count = Math.max(0, repo.watchers_count - 1);
  }

  await repo.save();
  successResponse(res, { 
    message: watchIndex === -1 ? 'Watching' : 'Unwatching', 
    watchers_count: repo.watchers_count,
    isWatching: watchIndex === -1 
  });
}));

/**
 * @swagger
 * /repos/search/query:
 *   get:
 *     summary: Search repositories
 *     tags: [Repositories]
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
router.get('/search/query', asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 10, language } = req.query;
  if (!q) throw new AppError('Search query required', 400);
  
  const { repos, total } = await repoService.searchRepositories({ q, page, limit, language });
  paginatedResponse(res, repos, page, limit, total);
}));

/**
 * @swagger
 * /repos/{id}/issues:
 *   post:
 *     summary: Create issue in repository
 *     tags: [Issues]
 *     security: [{ bearerAuth: [] }, { tokenAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               labels: { type: array, items: { type: string } }
 */
router.post('/:id/issues', auth, asyncHandler(async (req, res) => {
  const { title, description, labels } = req.body;
  const issue = await repoService.createIssue(req.params.id, req.user.id, { title, description, labels });

  const repo = await Repository.findById(req.params.id);
  await dispatchRepoEvent(req.params.id, 'issues', {
    action: 'opened',
    issue: issue,
    repository: repo.toObject(),
    sender: req.user
  });

  successResponse(res, issue, 'Issue created successfully', 201);
}));

/**
 * @swagger
 * /repos/{id}/issues:
 *   get:
 *     summary: Get repository issues
 *     tags: [Issues]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         schema: { type: string, enum: [open, closed], default: open }
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 10 }
 */
router.get('/:id/issues', optionalAuth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, state = 'open' } = req.query;
  const { issues, total } = await repoService.getRepositoryIssues(req.params.id, req.user?.id, { page, limit, state });
  paginatedResponse(res, issues, page, limit, total);
}));

router.put('/:id/issues/:issueId', auth, asyncHandler(async (req, res) => {
  const issue = await repoService.updateIssue(req.params.id, req.params.issueId, req.user.id, req.body);
  successResponse(res, issue, 'Issue updated successfully');
}));

router.get('/:id/contents', optionalAuth, asyncHandler(async (req, res) => {
  const { branch } = req.query;
  const tree = await repoService.getRepoFileTree(req.params.id, req.user?.id, branch || 'main');
  successResponse(res, tree);
}));

router.post('/:id/contents', auth, asyncHandler(async (req, res) => {
  const { name, path, type, content, parentPath, commitMessage, branch } = req.body;
  const node = await repoService.addRepoFileNode(req.params.id, req.user.id, { name, path, type, content, parentPath, commitMessage, branch: branch || 'main' });
  successResponse(res, node, 'File created successfully', 201);
}));

router.put('/:id/contents', auth, asyncHandler(async (req, res) => {
  const { oldPath, name, path, content, commitMessage, branch } = req.body;
  const node = await repoService.updateRepoFileNode(req.params.id, req.user.id, oldPath, { name, path, content, commitMessage, branch: branch || 'main' });
  successResponse(res, node, 'File updated successfully');
}));

router.delete('/:id/contents', auth, asyncHandler(async (req, res) => {
  const { path, branch } = req.body;
  const result = await repoService.deleteRepoFileNode(req.params.id, req.user.id, path, branch || 'main');
  successResponse(res, result);
}));

router.get('/:id/compare', optionalAuth, asyncHandler(async (req, res) => {
  const { base, head } = req.query;
  const diffs = await repoService.compareBranches(req.params.id, head || 'main', base || 'main');
  successResponse(res, diffs);
}));

router.get('/:id/commits', optionalAuth, asyncHandler(async (req, res) => {
  const commits = await repoService.getRepoCommits(req.params.id, req.user?.id);
  successResponse(res, commits);
}));

router.get('/:id/commits/:commitId', optionalAuth, asyncHandler(async (req, res) => {
  const { id, commitId } = req.params;
  
  const repo = await Repository.findById(id);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.visibility === 'private' && (!req.user || repo.owner.toString() !== req.user.id.toString())) {
    throw new AppError('Unauthorized', 403);
  }

  const Contribution = (await import('../models/contribution.js')).default;
  const commit = await Contribution.findById(commitId);
  if (!commit) throw new AppError('Commit not found', 404);

  const FileNode = (await import('../models/fileNode.js')).default;
  const changedNodes = await FileNode.find({ 
    repository: id, 
    lastCommitMessage: commit.commitMessage 
  }).lean();

  const files = changedNodes.map(node => {
    const fileLines = (node.content || '').split('\n');
    const diff = fileLines.map(line => `+ ${line}`).join('\n');
    
    return {
      name: node.path,
      additions: fileLines.length,
      deletions: 0,
      diff: diff
    };
  });

  successResponse(res, {
    hash: commit.commitHash || commit._id.toString().substring(0, 7),
    message: commit.commitMessage || commit.type.replace(/_/g, ' '),
    author: commit.commitAuthor || 'unknown',
    date: commit.created_at,
    files
  });
}));

router.get('/:id/branches', optionalAuth, asyncHandler(async (req, res) => {
  const branches = await repoService.getBranches(req.params.id, req.user?.id);
  successResponse(res, branches);
}));

router.post('/:id/branches', auth, asyncHandler(async (req, res) => {
  const { name } = req.body;
  const branches = await repoService.createBranch(req.params.id, req.user.id, name);
  successResponse(res, branches, 'Branch created successfully', 201);
}));

/**
 * @swagger
 * /repos/{id}/branches/{branch}/protection:
 *   get:
 *     summary: Get branch protection rules
 *     tags: [Branches]
 */
router.get('/:id/branches/:branch/protection', auth, asyncHandler(async (req, res) => {
  const protection = await BranchProtection.findOne({ 
    repository: req.params.id, 
    branch: req.params.branch 
  });
  successResponse(res, protection || null);
}));

/**
 * @swagger
 * /repos/{id}/branches/{branch}/protection:
 *   put:
 *     summary: Update branch protection rules
 *     tags: [Branches]
 */
router.put('/:id/branches/:branch/protection', auth, asyncHandler(async (req, res) => {
  const repo = await Repository.findById(req.params.id);
  if (!repo || repo.owner.toString() !== req.user.id) {
    throw new AppError('Unauthorized', 403);
  }

  const {
    require_pr_reviews,
    required_approving_review_count,
    require_status_checks,
    strict_status_checks,
    contexts,
    enforce_admins,
    require_linear_history,
    allow_force_pushes,
    allow_deletions
  } = req.body;

  let protection = await BranchProtection.findOne({ repository: repo._id, branch: req.params.branch });
  
  if (!protection) {
    protection = new BranchProtection({ repository: repo._id, branch: req.params.branch });
  }

  if (require_pr_reviews !== undefined) protection.require_pr_reviews = require_pr_reviews;
  if (required_approving_review_count !== undefined) protection.required_approving_review_count = required_approving_review_count;
  if (require_status_checks !== undefined) protection.require_status_checks = require_status_checks;
  if (strict_status_checks !== undefined) protection.strict_status_checks = strict_status_checks;
  if (contexts !== undefined) protection.contexts = contexts;
  if (enforce_admins !== undefined) protection.enforce_admins = enforce_admins;
  if (require_linear_history !== undefined) protection.require_linear_history = require_linear_history;
  if (allow_force_pushes !== undefined) protection.allow_force_pushes = allow_force_pushes;
  if (allow_deletions !== undefined) protection.allow_deletions = allow_deletions;

  await protection.save();
  successResponse(res, protection, 'Branch protection updated successfully');
}));

/**
 * @swagger
 * /repos/{id}/branches/{branch}/protection:
 *   delete:
 *     summary: Delete branch protection rules
 *     tags: [Branches]
 */
router.delete('/:id/branches/:branch/protection', auth, asyncHandler(async (req, res) => {
  const repo = await Repository.findById(req.params.id);
  if (!repo || repo.owner.toString() !== req.user.id) {
    throw new AppError('Unauthorized', 403);
  }

  await BranchProtection.findOneAndDelete({ repository: repo._id, branch: req.params.branch });
  successResponse(res, null, 'Branch protection removed successfully');
}));

router.get('/:id/tags', optionalAuth, asyncHandler(async (req, res) => {
  const tags = await repoService.getTags(req.params.id, req.user?.id);
  successResponse(res, tags);
}));

router.post('/:id/tags', auth, asyncHandler(async (req, res) => {
  const { name } = req.body;
  const tags = await repoService.createTag(req.params.id, req.user.id, name);
  successResponse(res, tags, 'Tag created successfully', 201);
}));

// GET comments for an issue
router.get('/:id/issues/:issueId/comments', optionalAuth, asyncHandler(async (req, res) => {
  const comments = await Comment.find({ issue: req.params.issueId })
    .populate('author', 'login avatar_url')
    .sort('createdAt');
  successResponse(res, comments);
}));

// POST a new comment on an issue
router.post('/:id/issues/:issueId/comments', auth, asyncHandler(async (req, res) => {
  const { body } = req.body;
  if (!body) throw new AppError('Comment body is required', 400);

  const comment = new Comment({
    body,
    author: req.user.id,
    issue: req.params.issueId
  });

  await comment.save();
  await comment.populate('author', 'login avatar_url');
  successResponse(res, comment, 'Comment posted successfully', 201);
}));

// Projects Board Endpoints
router.get('/:id/projects', optionalAuth, asyncHandler(async (req, res) => {
  const cards = await ProjectCard.find({ repository: req.params.id })
    .populate('creator', 'login name avatar_url')
    .sort('createdAt');
  successResponse(res, cards);
}));

router.post('/:id/projects', auth, asyncHandler(async (req, res) => {
  const { title, description, column } = req.body;
  if (!title) throw new AppError('Title is required', 400);

  const card = new ProjectCard({
    repository: req.params.id,
    title,
    description: description || "",
    column: column || "todo",
    creator: req.user.id
  });

  await card.save();
  await card.populate('creator', 'login name avatar_url');
  successResponse(res, card, 'Card created successfully', 201);
}));

router.patch('/:id/projects/cards/:cardId', auth, asyncHandler(async (req, res) => {
  const { title, description, column } = req.body;
  const card = await ProjectCard.findById(req.params.cardId);
  if (!card) throw new AppError('Card not found', 404);

  if (card.creator.toString() !== req.user.id.toString()) {
    throw new AppError('Unauthorized: only the card creator can update this card', 403);
  }

  if (title !== undefined) card.title = title;
  if (description !== undefined) card.description = description;
  if (column !== undefined) card.column = column;

  await card.save();
  successResponse(res, card, 'Card updated successfully');
}));

router.delete('/:id/projects/cards/:cardId', auth, asyncHandler(async (req, res) => {
  const card = await ProjectCard.findById(req.params.cardId);
  if (!card) throw new AppError('Card not found', 404);

  if (card.creator.toString() !== req.user.id.toString()) {
    throw new AppError('Unauthorized: only the card creator can delete this card', 403);
  }

  await ProjectCard.deleteOne({ _id: req.params.cardId });
  successResponse(res, null, 'Card deleted successfully');
}));

// Actions (Workflow Runs) Endpoints
router.get('/:id/actions/runs', optionalAuth, asyncHandler(async (req, res) => {
  const runs = await WorkflowRun.find({ repository: req.params.id })
    .sort('-createdAt');
  successResponse(res, runs);
}));

router.post('/:id/actions/runs', auth, asyncHandler(async (req, res) => {
  const { branch } = req.body;
  const run = await triggerWorkflowRun(req.params.id, branch || 'main');
  
  if (!run) {
    throw new AppError('Failed to trigger workflow run', 500);
  }
  
  successResponse(res, run, 'Workflow triggered successfully', 201);
}));

// Secrets Management Endpoints
router.get('/:id/secrets', auth, asyncHandler(async (req, res) => {
  // Check authorization - only owners can list secrets
  const repo = await Repository.findById(req.params.id);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== req.user.id.toString()) throw new AppError('Unauthorized', 401);

  // Find secrets but explicitly omit the encrypted 'value' field!
  const secrets = await Secret.find({ repository: req.params.id }, '-value')
    .sort('-createdAt');
  successResponse(res, secrets);
}));

router.post('/:id/secrets', auth, asyncHandler(async (req, res) => {
  const { name, value } = req.body;
  if (!name || !name.trim()) throw new AppError('Secret name is required', 400);
  if (!value || !value.trim()) throw new AppError('Secret value is required', 400);

  const repo = await Repository.findById(req.params.id);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== req.user.id.toString()) throw new AppError('Unauthorized', 401);

  const cleanName = name.trim().toUpperCase();
  const encryptedValue = encrypt(value);

  // Check if secret already exists to update it, or create a new one
  let secret = await Secret.findOne({ repository: req.params.id, name: cleanName });
  if (secret) {
    secret.value = encryptedValue;
  } else {
    secret = new Secret({
      repository: req.params.id,
      name: cleanName,
      value: encryptedValue
    });
  }

  await secret.save();
  // Return the secret name, omit value
  successResponse(res, { _id: secret._id, name: secret.name, created_at: secret.created_at }, 'Secret saved successfully');
}));

router.delete('/:id/secrets/:secretId', auth, asyncHandler(async (req, res) => {
  const repo = await Repository.findById(req.params.id);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== req.user.id.toString()) throw new AppError('Unauthorized', 401);

  const secret = await Secret.findById(req.params.secretId);
  if (!secret) throw new AppError('Secret not found', 404);

  await Secret.deleteOne({ _id: req.params.secretId });
  successResponse(res, null, 'Secret deleted successfully');
}));

// ZIP Download Route
router.get('/:id/zip', optionalAuth, asyncHandler(async (req, res) => {
  const repo = await Repository.findById(req.params.id);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  
  if (repo.visibility === 'private' && (!req.user || repo.owner.toString() !== req.user.id.toString())) {
    throw new AppError('Unauthorized', 401);
  }

  const branch = req.query.branch || repo.default_branch || 'main';

  // Find all files in the current branch
  const files = await FileNode.find({
    repository: repo._id,
    branch: branch,
    type: 'file'
  });

  if (!files || files.length === 0) {
    throw new AppError('Repository is empty', 404);
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${repo.name}-${branch}.zip"`);

  const archiverModule = await import('archiver');
  const archiver = archiverModule.default || archiverModule;

  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  archive.on('error', function(err) {
    console.error('Archiver error:', err);
    res.status(500).send({ error: err.message });
  });

  // Pipe archive data to the response
  archive.pipe(res);

  // Append files
  for (const file of files) {
    if (file.content) {
      // Decode base64 content
      const buffer = Buffer.from(file.content, 'base64');
      archive.append(buffer, { name: file.path });
    }
  }

  await archive.finalize();
}));

// Bulk Sync Route for CLI Pushing
router.post('/:id/sync', auth, asyncHandler(async (req, res) => {
  const repo = await Repository.findById(req.params.id);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== req.user.id.toString()) throw new AppError('Unauthorized', 401);

  const { files, commitMessage, branch = 'main', force } = req.body;
  if (!Array.isArray(files)) throw new AppError('Files list must be an array', 400);

  // Branch Protection checks
  const protection = await BranchProtection.findOne({ repository: repo._id, branch });
  if (protection) {
    if (protection.require_pr_reviews) {
      throw new AppError(`Cannot push directly to ${branch} branch. Branch protection requires a pull request with approving reviews.`, 403);
    }
    if (force && !protection.allow_force_pushes) {
      throw new AppError(`Cannot force push to ${branch} branch. Branch protection forbids force pushes.`, 403);
    }
  }

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  let newRepoSize = 0;

  for (const file of files) {
    if (file.type === 'file' || !file.type) {
      const size = Buffer.byteLength(file.content || '', 'utf8');
      if (size > MAX_FILE_SIZE) {
        throw new AppError(`File ${file.name} exceeds the maximum allowed size of 100MB`, 413);
      }
      file.size = size;
      newRepoSize += size;
    } else {
      file.size = 0;
    }
  }

  const user = await User.findById(req.user.id);
  const oldRepoSize = repo.size || 0;
  
  if ((user.storage_used || 0) - oldRepoSize + newRepoSize > (user.storage_limit || 1048576000)) {
    throw new AppError('Storage quota exceeded. Please upgrade your plan or free up space.', 413);
  }

  user.storage_used = Math.max(0, (user.storage_used || 0) - oldRepoSize + newRepoSize);
  await user.save();

  repo.size = newRepoSize;
  await repo.save();

  const commitMsg = commitMessage || 'Sync repository files';
  const authorName = req.user.login || 'unknown';
  const commitDate = new Date();
  
  const crypto = await import('crypto');
  const commitHash = crypto.randomBytes(20).toString('hex');

  // 1. Delete all current file nodes
  await FileNode.deleteMany({ repository: req.params.id });

  // 2. Insert new file nodes
  const formattedNodes = files.map(file => ({
    repository: req.params.id,
    name: file.name,
    path: file.path,
    type: file.type || 'file',
    content: file.content || "",
    parentPath: file.parentPath || "",
    size: file.size || 0,
    branch: file.branch || 'main',
    lastCommitMessage: commitMsg,
    lastCommitAuthor: authorName,
    lastCommitDate: commitDate
  }));

  if (formattedNodes.length > 0) {
    await FileNode.insertMany(formattedNodes);
  }

  // 3. Record a contribution (Push Commit)
  await recordContribution(req.user.id, 'file_updated', req.params.id, {
    commitMessage: commitMsg,
    commitAuthor: authorName,
    commitHash: commitHash
  });

  // 4. Automatic Issue/PR closing from commit message
  const issueRegex = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi;
  let match;
  const issueNumbers = [];
  while ((match = issueRegex.exec(commitMsg)) !== null) {
    issueNumbers.push(parseInt(match[1], 10));
  }

  if (issueNumbers.length > 0) {
    const Issue = (await import('../models/issue.js')).default;
    const Comment = (await import('../models/comment.js')).default;
    const PullRequest = (await import('../models/pullRequest.js')).default;

    for (const num of issueNumbers) {
      const issue = await Issue.findOne({ repository: req.params.id, number: num, state: 'open' });
      if (issue) {
        issue.state = 'closed';
        await issue.save();

        const systemComment = new Comment({
          issue: issue._id,
          user: req.user.id,
          body: `Closed automatically by commit message referencing this issue (${commitHash.substring(0, 7)}).`
        });
        await systemComment.save();
        
        issue.comments_count += 1;
        await issue.save();
      }

      const pr = await PullRequest.findOne({ repository: req.params.id, number: num, status: 'open' });
      if (pr) {
        pr.status = 'closed';
        await pr.save();
      }
    }
  }

  // 5. Trigger automated actions workflow run
  const activeBranch = (files && files.length > 0) ? (files[0].branch || 'main') : 'main';
  await triggerWorkflowRun(req.params.id, activeBranch);

  // 6. Dispatch push webhook
  await dispatchRepoEvent(req.params.id, 'push', {
    repository: repo.toObject(),
    pusher: req.user,
    ref: `refs/heads/${activeBranch}`,
    commits: [
      {
        id: commitHash,
        message: commitMsg,
        timestamp: commitDate,
        author: { name: authorName }
      }
    ]
  });

  successResponse(res, null, 'Repository file tree synced successfully');
}));

export default router;
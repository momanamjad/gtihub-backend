import express from 'express';
import { validateRequest, validateQuery } from '../utils/validate.js';
import { createRepoValidator, updateRepoValidator, paginationValidator } from '../utils/validators.js';
import { successResponse, paginatedResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import * as repoService from '../services/repoService.js';
import Comment from '../models/comment.js';
import Repository from '../models/repository.js';

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
  const repo = await repoService.createRepository(req.user.id, req.validated);
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
  const tree = await repoService.getRepoFileTree(req.params.id, req.user?.id);
  successResponse(res, tree);
}));

router.post('/:id/contents', auth, asyncHandler(async (req, res) => {
  const node = await repoService.addRepoFileNode(req.params.id, req.user.id, req.body);
  successResponse(res, node, 'File created successfully', 201);
}));

router.put('/:id/contents', auth, asyncHandler(async (req, res) => {
  const { oldPath, name, path, content } = req.body;
  const node = await repoService.updateRepoFileNode(req.params.id, req.user.id, oldPath, { name, path, content });
  successResponse(res, node, 'File updated successfully');
}));

router.delete('/:id/contents', auth, asyncHandler(async (req, res) => {
  const { path } = req.body;
  const result = await repoService.deleteRepoFileNode(req.params.id, req.user.id, path);
  successResponse(res, result);
}));

router.get('/:id/commits', optionalAuth, asyncHandler(async (req, res) => {
  const commits = await repoService.getRepoCommits(req.params.id, req.user?.id);
  successResponse(res, commits);
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

export default router;
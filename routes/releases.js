import express from 'express';
import Release from '../models/release.js';
import Repository from '../models/repository.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { successResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';

const router = express.Router({ mergeParams: true });

// GET all releases for a repository
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && (!req.user || repo.owner.toString() !== req.user.id.toString())) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const releases = await Release.find({ repository: repoId })
    .populate('author', 'login avatar_url')
    .sort('-createdAt');

  successResponse(res, releases);
}));

// POST create a release
router.post('/', auth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  const { tagName, name, body, assets = [], isPrerelease = false, isDraft = false } = req.body;

  if (!tagName?.trim()) throw new AppError('Tag name is required', 400);
  if (!name?.trim()) throw new AppError('Release title is required', 400);

  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== req.user.id.toString()) throw new AppError('Unauthorized to create release', 403);

  // Check if tag already exists in releases
  const existingRelease = await Release.findOne({ repository: repoId, tagName });
  if (existingRelease) {
    throw new AppError(`Release for tag "${tagName}" already exists`, 400);
  }

  const release = new Release({
    repository: repoId,
    tagName,
    name,
    body,
    author: req.user.id,
    assets: assets.map(a => ({
      name: a.name || 'asset',
      size: a.size || 0,
      downloadUrl: a.downloadUrl || '#'
    })),
    isPrerelease,
    isDraft
  });

  await release.save();
  await release.populate('author', 'login avatar_url');

  // Add the tag to repository tags list if not already present
  if (!repo.tags.includes(tagName)) {
    repo.tags.push(tagName);
    await repo.save();
  }

  successResponse(res, release, 'Release published successfully', 201);
}));

// DELETE a release
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const { repoId, id } = req.params;

  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== req.user.id.toString()) throw new AppError('Unauthorized to delete release', 403);

  const release = await Release.findOneAndDelete({ _id: id, repository: repoId });
  if (!release) throw new AppError('Release not found', 404);

  successResponse(res, null, 'Release deleted successfully');
}));

export default router;

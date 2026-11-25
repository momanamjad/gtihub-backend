import Repository from '../models/repository.js';
import { AppError } from './errorHandler.js';

/**
 * Verifies repository existence, visibility, and optional ownership.
 * Returns the lean repository document on success.
 */
export const assertRepoAccess = async (repoId, viewerId, { requireOwner = false, select = 'owner visibility is_deleted name' } = {}) => {
  const repo = await Repository.findById(repoId).select(select).lean();
  if (!repo || repo.is_deleted) {
    throw new AppError('Repository not found', 404);
  }

  const ownerId = repo.owner?._id?.toString() || repo.owner?.toString();
  const isOwner = Boolean(viewerId && ownerId === viewerId.toString());

  if (requireOwner && !isOwner) {
    throw new AppError('Unauthorized', 403);
  }

  if (repo.visibility === 'private' && !isOwner) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  return repo;
};

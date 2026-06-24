import express from 'express';
import WikiPage from '../models/wikiPage.js';
import Repository from '../models/repository.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { successResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';

const router = express.Router({ mergeParams: true });

// Helper to generate a URL-safe slug from title
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

// GET all wiki pages (titles and slugs) for a repository
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && (!req.user || repo.owner.toString() !== req.user.id.toString())) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const pages = await WikiPage.find({ repository: repoId })
    .select('title slug updated_at')
    .sort('title');
    
  successResponse(res, pages);
}));

// GET details of a single wiki page
router.get('/:slug', optionalAuth, asyncHandler(async (req, res) => {
  const { repoId, slug } = req.params;

  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && (!req.user || repo.owner.toString() !== req.user.id.toString())) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const page = await WikiPage.findOne({ repository: repoId, slug })
    .populate('author', 'login avatar_url');
    
  if (!page) throw new AppError('Wiki page not found', 404);

  successResponse(res, page);
}));

// POST / create or edit a wiki page
router.post('/', auth, asyncHandler(async (req, res) => {
  const { repoId } = req.params;
  const { title, content } = req.body;

  if (!title) throw new AppError('Title is required', 400);

  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  // Allow repo owner to edit wiki
  if (repo.owner.toString() !== req.user.id.toString()) {
    throw new AppError('Unauthorized to edit wiki', 403);
  }

  const slug = generateSlug(title);

  // Check if page already exists for this slug
  let page = await WikiPage.findOne({ repository: repoId, slug });

  if (page) {
    // Update existing page
    page.title = title;
    page.content = content || "";
    page.author = req.user.id;
    await page.save();
  } else {
    // Create new page
    page = new WikiPage({
      repository: repoId,
      title,
      content: content || "",
      slug,
      author: req.user.id
    });
    await page.save();
  }

  await page.populate('author', 'login avatar_url');
  successResponse(res, page, 'Wiki page saved successfully');
}));

// DELETE a wiki page
router.delete('/:slug', auth, asyncHandler(async (req, res) => {
  const { repoId, slug } = req.params;

  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.owner.toString() !== req.user.id.toString()) {
    throw new AppError('Unauthorized to delete wiki page', 403);
  }

  const page = await WikiPage.findOneAndDelete({ repository: repoId, slug });
  if (!page) throw new AppError('Wiki page not found', 404);

  successResponse(res, null, 'Wiki page deleted successfully');
}));

export default router;

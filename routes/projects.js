import express from 'express';
import ProjectCard from '../models/project.js';
import Repository from '../models/repository.js';
import { auth } from '../middleware/auth.js';
import { successResponse } from '../utils/responseFormatter.js';
import { asyncHandler } from '../utils/errorHandler.js';

const router = express.Router();

router.get('/', auth, asyncHandler(async (req, res) => {
  // Find all repositories owned by the user
  const userRepos = await Repository.find({ owner: req.user.id, is_deleted: false });
  const repoIds = userRepos.map(r => r._id);

  // Find all project cards for those repositories
  const cards = await ProjectCard.find({ repository: { $in: repoIds } })
    .populate('repository', 'name owner')
    .populate('creator', 'login name avatar_url')
    .sort('-createdAt');

  successResponse(res, cards);
}));

export default router;

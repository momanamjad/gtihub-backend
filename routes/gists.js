import express from 'express';
import { auth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { successResponse, paginatedResponse } from '../utils/responseFormatter.js';
import Gist from '../models/gist.js';
import User from '../models/user.js';

const router = express.Router();

// GET all public gists (Explore)
router.get('/public', optionalAuth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const gists = await Gist.find({ public: true })
    .populate('owner', 'login avatar_url')
    .sort('-created_at')
    .skip(skip)
    .limit(limit)
    .lean();
    
  const total = await Gist.countDocuments({ public: true });
  paginatedResponse(res, gists, page, limit, total);
}));

// GET user's gists
router.get('/user', auth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const gists = await Gist.find({ owner: req.user.id })
    .populate('owner', 'login avatar_url')
    .sort('-created_at')
    .skip(skip)
    .limit(limit)
    .lean();
    
  const total = await Gist.countDocuments({ owner: req.user.id });
  paginatedResponse(res, gists, page, limit, total);
}));

// GET a specific gist by ID
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const gist = await Gist.findById(req.params.id).populate('owner', 'login avatar_url');
  
  if (!gist) {
    throw new AppError('Gist not found', 404);
  }
  
  if (!gist.public) {
    if (!req.user || gist.owner._id.toString() !== req.user.id) {
      throw new AppError('Unauthorized access to private gist', 403);
    }
  }

  successResponse(res, gist);
}));

// CREATE a new gist
router.post('/', auth, asyncHandler(async (req, res) => {
  const { description, public: isPublic = true, files } = req.body;
  
  if (!files || files.length === 0) {
    throw new AppError('At least one file is required', 400);
  }

  const processedFiles = files.map(file => ({
    filename: file.filename || 'gistfile1.txt',
    content: file.content,
    language: file.language || 'text',
    size: Buffer.byteLength(file.content || '', 'utf8')
  }));

  const gist = new Gist({
    owner: req.user.id,
    description,
    public: isPublic,
    files: processedFiles
  });

  await gist.save();
  await gist.populate('owner', 'login avatar_url');
  
  successResponse(res, gist, 'Gist created successfully', 201);
}));

// DELETE a gist
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const gist = await Gist.findById(req.params.id);
  if (!gist) throw new AppError('Gist not found', 404);
  if (gist.owner.toString() !== req.user.id) throw new AppError('Unauthorized', 403);

  await gist.deleteOne();
  successResponse(res, null, 'Gist deleted successfully');
}));

export default router;

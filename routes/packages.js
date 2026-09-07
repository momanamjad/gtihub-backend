import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { auth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { successResponse } from '../utils/responseFormatter.js';
import Package from '../models/package.js';
import Repository from '../models/repository.js';

// Setup local storage for package tarballs
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'packages');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB limit

const router = express.Router();

/**
 * GET all packages for a user/org
 */
router.get('/user/:ownerId', optionalAuth, asyncHandler(async (req, res) => {
  const packages = await Package.find({ owner: req.params.ownerId })
    .populate('repository', 'name')
    .sort('-updated_at')
    .lean();
    
  successResponse(res, packages);
}));

/**
 * GET all packages for a repository
 */
router.get('/repo/:repoId', optionalAuth, asyncHandler(async (req, res) => {
  const packages = await Package.find({ repository: req.params.repoId })
    .populate('owner', 'login avatar_url')
    .sort('-updated_at')
    .lean();
    
  successResponse(res, packages);
}));

/**
 * NPM Registry Mock: GET /:packageName
 * Returns package metadata in NPM format
 */
router.get('/npm/:name', asyncHandler(async (req, res) => {
  const pkg = await Package.findOne({ name: req.params.name, packageType: 'npm' });
  if (!pkg) return res.status(404).json({ error: "Not found" });

  const versions = {};
  pkg.versions.forEach(v => {
    versions[v.version] = {
      name: pkg.name,
      version: v.version,
      dist: {
        tarball: v.tarballUrl
      }
    };
  });

  res.json({
    name: pkg.name,
    description: pkg.description,
    "dist-tags": {
      latest: pkg.latest_version
    },
    versions
  });
}));

/**
 * Upload a new package version (UI/CLI endpoint)
 */
router.post('/upload', auth, upload.single('file'), asyncHandler(async (req, res) => {
  const { name, version, description, repoId, packageType = 'npm' } = req.body;
  if (!name || !version || !req.file) {
    throw new AppError('Name, version, and file are required', 400);
  }

  // Find or create package
  let pkg = await Package.findOne({ name, owner: req.user.id });
  
  if (!pkg) {
    pkg = new Package({
      name,
      packageType,
      owner: req.user.id,
      repository: repoId || null,
      description: description || ''
    });
  }

  // Check if version exists
  const vExists = pkg.versions.find(v => v.version === version);
  if (vExists) throw new AppError(`Version ${version} already exists`, 400);

  // Add version
  const tarballUrl = `${req.protocol}://${req.get('host')}/uploads/packages/${req.file.filename}`;
  
  pkg.versions.push({
    version,
    tarballUrl,
    size: req.file.size,
    author: req.user.id
  });

  pkg.latest_version = version;
  pkg.updated_at = new Date();
  
  await pkg.save();

  successResponse(res, pkg, 'Package version uploaded successfully', 201);
}));

/**
 * DELETE a package
 */
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const pkg = await Package.findById(req.params.id);
  if (!pkg) throw new AppError('Package not found', 404);
  if (pkg.owner.toString() !== req.user.id) throw new AppError('Unauthorized', 403);

  await pkg.deleteOne();
  successResponse(res, null, 'Package deleted successfully');
}));

export default router;

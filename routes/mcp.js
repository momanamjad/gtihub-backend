import express from 'express';
import McpServer from '../models/mcpServer.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';

const router = express.Router();

// List all MCP servers
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { category, q } = req.query;
  const filter = {};
  
  if (category && category !== 'all') {
    filter.category = category;
  }
  
  if (q) {
    filter.$text = { $search: q };
  }

  const servers = await McpServer.find(filter)
    .populate('creator', 'login name avatar_url')
    .sort('-created_at');

  // Format stars count and check if user has starred
  const formatted = servers.map(s => {
    const obj = s.toObject();
    obj.starsCount = s.stars?.length || 0;
    obj.isStarred = req.user ? s.stars.some(userId => userId.toString() === req.user.id.toString()) : false;
    delete obj.stars;
    return obj;
  });

  successResponse(res, formatted);
}));

// Register an MCP server
router.post('/', auth, asyncHandler(async (req, res) => {
  const { name, description, type, command, args, url, category } = req.body;

  if (!name) throw new AppError('Server name is required', 400);

  const existing = await McpServer.findOne({ name });
  if (existing) throw new AppError('An MCP server with this name already exists', 400);

  const server = new McpServer({
    name,
    description,
    type: type || 'stdio',
    command: command || '',
    args: args || [],
    url: url || '',
    category: category || 'tools',
    creator: req.user.id,
    downloads: 0
  });

  await server.save();
  successResponse(res, server, 'MCP Server registered successfully', 201);
}));

// Toggle star on an MCP server
router.post('/:id/star', auth, asyncHandler(async (req, res) => {
  const server = await McpServer.findById(req.params.id);
  if (!server) throw new AppError('MCP server not found', 404);

  const userId = req.user.id;
  const starIndex = server.stars.findIndex(id => id.toString() === userId.toString());

  if (starIndex === -1) {
    server.stars.push(userId);
  } else {
    server.stars.splice(starIndex, 1);
  }

  await server.save();

  const obj = server.toObject();
  obj.starsCount = server.stars.length;
  obj.isStarred = starIndex === -1;
  delete obj.stars;

  successResponse(res, obj, starIndex === -1 ? 'Starred successfully' : 'Unstarred successfully');
}));

export default router;

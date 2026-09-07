import express from 'express';
import User from '../models/user.js';
import OrgMember from '../models/orgMember.js';
import Team from '../models/team.js';
import TeamMember from '../models/teamMember.js';
import Repository from '../models/repository.js';
import TeamRepo from '../models/teamRepo.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { successResponse } from '../utils/responseFormatter.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';

const router = express.Router();

// Middleware to verify org admin
const checkOrgAdmin = async (req, res, next) => {
  const org = await User.findOne({ login: req.params.org, account_type: 'Organization' });
  if (!org) return next(new AppError('Organization not found', 404));

  const member = await OrgMember.findOne({ organization: org._id, user: req.user.id, role: 'admin' });
  if (!member) return next(new AppError('Requires organization admin role', 403));

  req.org = org;
  next();
};

// CREATE an Organization
router.post('/', auth, asyncHandler(async (req, res) => {
  const { login, email, name, description } = req.body;
  if (!login) throw new AppError('Organization login is required', 400);

  const existingUser = await User.findOne({ login });
  if (existingUser) throw new AppError('Username or organization name is already taken', 409);

  const org = new User({
    login,
    email: email || undefined,
    name,
    bio: description,
    account_type: 'Organization',
    avatar_url: `https://avatars.githubusercontent.com/u/${Math.floor(Math.random() * 10000000)}?v=4`
  });
  await org.save();

  // Create the creator as an org admin
  await OrgMember.create({
    organization: org._id,
    user: req.user.id,
    role: 'admin'
  });

  successResponse(res, org, 'Organization created successfully', 201);
}));

// GET user's organizations
router.get('/my-orgs', auth, asyncHandler(async (req, res) => {
  const memberships = await OrgMember.find({ user: req.user.id }).populate('organization', 'login name avatar_url');
  const orgs = memberships.map(m => m.organization);
  successResponse(res, orgs);
}));

// GET org details
router.get('/:org', optionalAuth, asyncHandler(async (req, res) => {
  const org = await User.findOne({ login: req.params.org, account_type: 'Organization' });
  if (!org) throw new AppError('Organization not found', 404);
  
  successResponse(res, org);
}));

// GET org members
router.get('/:org/members', optionalAuth, asyncHandler(async (req, res) => {
  const org = await User.findOne({ login: req.params.org, account_type: 'Organization' });
  if (!org) throw new AppError('Organization not found', 404);

  const members = await OrgMember.find({ organization: org._id })
    .populate('user', 'login name avatar_url');
    
  successResponse(res, members);
}));

// ADD member to org (simplified: direct add, no invitation flow)
router.post('/:org/members', auth, checkOrgAdmin, asyncHandler(async (req, res) => {
  const { username, role } = req.body;
  const targetUser = await User.findOne({ login: username, account_type: 'User' });
  if (!targetUser) throw new AppError('User not found', 404);

  let membership = await OrgMember.findOne({ organization: req.org._id, user: targetUser._id });
  if (membership) {
    membership.role = role || 'member';
    await membership.save();
  } else {
    membership = await OrgMember.create({
      organization: req.org._id,
      user: targetUser._id,
      role: role || 'member'
    });
  }

  successResponse(res, membership, 'Member added/updated successfully');
}));

// REMOVE member from org
router.delete('/:org/members/:username', auth, checkOrgAdmin, asyncHandler(async (req, res) => {
  const targetUser = await User.findOne({ login: req.params.username });
  if (!targetUser) throw new AppError('User not found', 404);

  // Prevent removing the last admin
  if (req.user.id === targetUser._id.toString()) {
    const adminCount = await OrgMember.countDocuments({ organization: req.org._id, role: 'admin' });
    if (adminCount <= 1) throw new AppError('Cannot remove the last organization admin', 400);
  }

  await OrgMember.findOneAndDelete({ organization: req.org._id, user: targetUser._id });
  await TeamMember.deleteMany({ user: targetUser._id }); // removes from all org teams
  
  successResponse(res, null, 'Member removed successfully');
}));

// CREATE team
router.post('/:org/teams', auth, checkOrgAdmin, asyncHandler(async (req, res) => {
  const { name, description, privacy } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  const team = new Team({
    organization: req.org._id,
    name,
    slug,
    description,
    privacy
  });
  await team.save();

  successResponse(res, team, 'Team created successfully', 201);
}));

// GET org teams
router.get('/:org/teams', auth, asyncHandler(async (req, res) => {
  const org = await User.findOne({ login: req.params.org, account_type: 'Organization' });
  if (!org) throw new AppError('Organization not found', 404);

  // Quick auth check: only members can see all teams
  const membership = await OrgMember.findOne({ organization: org._id, user: req.user.id });
  if (!membership) throw new AppError('Unauthorized', 403);

  const teams = await Team.find({ organization: org._id });
  successResponse(res, teams);
}));

export default router;

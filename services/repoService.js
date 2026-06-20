import Repository from '../models/repository.js';
import Star from '../models/star.js';
import Pin from '../models/pin.js';
import Issue from '../models/issue.js';
import User from '../models/user.js';
import Notification from '../models/notification.js';
import FileNode from '../models/fileNode.js';
import Contribution from '../models/contribution.js';
import { AppError } from '../utils/errorHandler.js';
import { recordContribution } from './userService.js';

export const createRepository = async (userId, repoData) => {
  const repo = new Repository({ 
    ...repoData, 
    owner: userId 
  });
  await repo.save();

  // Create default file nodes in FileNode collection
  const defaultTree = [
    { repository: repo._id, type: 'dir', name: 'src', path: 'src', parentPath: '' },
    { repository: repo._id, type: 'file', name: 'README.md', path: 'README.md', content: `# ${repoData.name}\n`, parentPath: '' }
  ];
  await FileNode.insertMany(defaultTree);

  await User.findByIdAndUpdate(userId, { $inc: { public_repos_count: 1 } });
  
  // Record contribution
  await recordContribution(userId, 'repo_created', repo._id);
  
  return repo;
};

export const getUserRepositories = async (userId, { page = 1, limit = 10, sort = '-created_at' }) => {
  const skip = (page - 1) * limit;
  const repos = await Repository.find({ owner: userId, is_deleted: false })
    .populate('owner', 'login name avatar_url')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await Repository.countDocuments({ owner: userId, is_deleted: false });

  return { repos, total };
};

export const getPublicRepositories = async ({ page = 1, limit = 10, sort = '-created_at', language = null }) => {
  const skip = (page - 1) * limit;
  const query = { visibility: 'public', is_deleted: false };
  
  if (language) query.language = language;

  const repos = await Repository.find(query)
    .populate('owner', 'login avatar_url')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await Repository.countDocuments(query);

  return { repos, total };
};

export const getRepositoryById = async (repoId, viewerId) => {
  const repo = await Repository.findById(repoId)
    .populate('owner', 'login avatar_url followers_count')
    .populate('issues_count');

  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && (!viewerId || repo.owner._id.toString() !== viewerId.toString())) {
    throw new AppError('Unauthorized access to private repository', 403);
  }
  
  const repoObj = repo.toObject();
  repoObj.fileTree = await getRepoFileTree(repoId, viewerId);
  repoObj.isWatching = viewerId ? (repo.watchers || []).some(id => id.toString() === viewerId.toString()) : false;
  return repoObj;
};

export const updateRepository = async (repoId, userId, updates) => {
  const repo = await Repository.findById(repoId);
  if (!repo) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId) throw new AppError('Unauthorized', 401);

  Object.assign(repo, updates);
  await repo.save();
  return repo;
};

export const deleteRepository = async (repoId, userId) => {
  const repo = await Repository.findById(repoId);
  if (!repo) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId) throw new AppError('Unauthorized', 401);

  repo.is_deleted = true;
  await repo.save();

  await Star.deleteMany({ repository: repoId });
  await Pin.deleteMany({ repository: repoId });

  await User.findByIdAndUpdate(userId, { $inc: { public_repos_count: -1 } });
  return { message: 'Repository deleted' };
};

export const toggleStar = async (repoId, userId) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && repo.owner.toString() !== userId.toString()) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const existing = await Star.findOne({ user: userId, repository: repoId });
  
  if (existing) {
    await existing.deleteOne();
    await Repository.findByIdAndUpdate(repoId, { $inc: { stars_count: -1 } });
    return { message: 'Unstarred' };
  }

  await new Star({ user: userId, repository: repoId }).save();
  await Repository.findByIdAndUpdate(repoId, { $inc: { stars_count: 1 } });

  // Create notification if starring someone else's repo
  if (repo.owner.toString() !== userId.toString()) {
    const actorUser = await User.findById(userId);
    await new Notification({
      user: repo.owner,
      actor: userId,
      type: 'star',
      repository: repoId,
      message: `${actorUser?.login || 'Someone'} starred your repository`,
    }).save();
  }

  return { message: 'Starred' };
};

export const togglePin = async (repoId, userId) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private') {
    throw new AppError('Only public repositories can be pinned', 400);
  }

  const existing = await Pin.findOne({ user: userId, repository: repoId });
  
  if (existing) {
    await existing.deleteOne();
    return { message: 'Unpinned' };
  }

  const count = await Pin.countDocuments({ user: userId });
  if (count >= 6) throw new AppError('Max 6 pins allowed', 400);

  const pin = new Pin({ user: userId, repository: repoId, order: count });
  await pin.save();
  return { message: 'Pinned' };
};

export const searchRepositories = async ({ q, page = 1, limit = 10, language = null }) => {
  const skip = (page - 1) * limit;
  const query = { visibility: 'public', is_deleted: false };
  
  if (language) query.language = language;

  const repos = await Repository.find(query)
    .find({ $text: { $search: q } })
    .populate('owner', 'login avatar_url')
    .skip(skip)
    .limit(limit);

  const total = await Repository.countDocuments(query);

  return { repos, total };
};

export const createIssue = async (repoId, userId, issueData) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && repo.owner.toString() !== userId.toString()) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const issue = new Issue({ ...issueData, repository: repoId, creator: userId });
  await issue.save();
  await Repository.findByIdAndUpdate(repoId, { $inc: { issues_count: 1 } });

  // Record contribution
  await recordContribution(userId, 'issue_created', repoId);

  // Trigger Notification to repository owner and watchers
  const notifyUsers = new Set();
  if (repo.owner.toString() !== userId.toString()) {
    notifyUsers.add(repo.owner.toString());
  }
  if (repo.watchers && repo.watchers.length > 0) {
    repo.watchers.forEach(watcherId => {
      if (watcherId.toString() !== userId.toString()) {
        notifyUsers.add(watcherId.toString());
      }
    });
  }

  for (const targetUserId of notifyUsers) {
    try {
      await new Notification({
        user: targetUserId,
        actor: userId,
        type: 'issue',
        repository: repoId,
        issue: issue._id,
        message: `opened a new issue: "${issue.title}"`
      }).save();
    } catch (notifErr) {
      console.error('Failed to save issue notification:', notifErr);
    }
  }

  return issue;
};

export const getRepositoryIssues = async (repoId, viewerId, { page = 1, limit = 10, state = 'open' }) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && (!viewerId || repo.owner.toString() !== viewerId.toString())) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const skip = (page - 1) * limit;
  const issues = await Issue.find({ repository: repoId, state, is_deleted: false })
    .populate('creator', 'login avatar_url')
    .populate('assignee', 'login avatar_url')
    .sort('-created_at')
    .skip(skip)
    .limit(limit);

  const total = await Issue.countDocuments({ repository: repoId, state, is_deleted: false });

  return { issues, total };
};

export const updateIssue = async (repoId, issueId, userId, updateData) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  if (repo.visibility === 'private' && repo.owner.toString() !== userId.toString()) {
    throw new AppError('Unauthorized access to private repository', 403);
  }

  const issue = await Issue.findOne({ _id: issueId, repository: repoId, is_deleted: false });
  if (!issue) throw new AppError('Issue not found', 404);

  const allowedFields = ['title', 'description', 'state', 'labels', 'assignee'];
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      if (field === 'assignee') {
        if (updateData[field]) {
          const userObj = await User.findOne({ login: updateData[field] });
          if (userObj) {
            issue.assignee = userObj._id;
          } else {
            try {
              issue.assignee = updateData[field];
            } catch (e) {
              issue.assignee = null;
            }
          }
        } else {
          issue.assignee = null;
        }
      } else {
        issue[field] = updateData[field];
      }
    }
  }

  await issue.save();
  
  return await Issue.findById(issue._id)
    .populate('creator', 'login avatar_url')
    .populate('assignee', 'login avatar_url');
};

export const getRepoFileTree = async (repoId, viewerId) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.visibility === 'private' && (!viewerId || repo.owner.toString() !== viewerId.toString())) {
    throw new AppError('Unauthorized', 403);
  }

  const flatNodes = await FileNode.find({ repository: repoId }).lean();
  
  const buildTree = (parentPath = '') => {
    return flatNodes
      .filter(n => n.parentPath === parentPath)
      .map(n => {
        const item = {
          _id: n._id,
          name: n.name,
          path: n.path,
          type: n.type,
          content: n.content
        };
        if (n.type === 'dir') {
          item.children = buildTree(n.path);
        }
        return item;
      });
  };

  return buildTree('');
};

export const addRepoFileNode = async (repoId, userId, { name, path, type, content, parentPath }) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId.toString()) throw new AppError('Unauthorized', 401);

  const existing = await FileNode.findOne({ repository: repoId, path });
  if (existing) throw new AppError('File or directory already exists', 400);

  const node = new FileNode({ repository: repoId, name, path, type, content, parentPath });
  await node.save();
  
  // Record contribution
  await recordContribution(userId, 'file_created', repoId);
  
  return node;
};

export const updateRepoFileNode = async (repoId, userId, oldPath, { name, path, content }) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId.toString()) throw new AppError('Unauthorized', 401);

  const node = await FileNode.findOne({ repository: repoId, path: oldPath });
  if (!node) throw new AppError('File not found', 404);

  if (name) node.name = name;
  if (path) {
    const oldPrefix = oldPath + '/';
    const newPrefix = path + '/';
    const children = await FileNode.find({ repository: repoId, path: new RegExp('^' + oldPrefix) });
    for (const child of children) {
      child.path = child.path.replace(oldPrefix, newPrefix);
      child.parentPath = child.parentPath.replace(oldPath, path);
      await child.save();
    }
    node.path = path;
    node.parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
  }
  if (content !== undefined) node.content = content;

  await node.save();
  
  // Record contribution
  await recordContribution(userId, 'file_updated', repoId);
  
  return node;
};

export const deleteRepoFileNode = async (repoId, userId, path) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId.toString()) throw new AppError('Unauthorized', 401);

  const node = await FileNode.findOne({ repository: repoId, path });
  if (!node) throw new AppError('File not found', 404);

  if (node.type === 'dir') {
    await FileNode.deleteMany({ repository: repoId, path: new RegExp('^' + path + '(/|$)') });
  } else {
    await node.deleteOne();
  }

  return { message: 'File deleted successfully' };
};

export const getRepoCommits = async (repoId, viewerId) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.visibility === 'private' && (!viewerId || repo.owner.toString() !== viewerId.toString())) {
    throw new AppError('Unauthorized', 403);
  }

  const commits = await Contribution.find({ 
    repository: repoId, 
    type: { $in: ['repo_created', 'file_created', 'file_updated'] } 
  })
  .populate('user', 'login name avatar_url')
  .sort('-created_at');

  return commits;
};

export const getBranches = async (repoId, viewerId) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.visibility === 'private' && (!viewerId || repo.owner.toString() !== viewerId.toString())) {
    throw new AppError('Unauthorized', 403);
  }
  let branchesList = repo.branches || [];
  if (branchesList.length === 0 || !branchesList.includes('main')) {
    branchesList = ['main', ...branchesList];
  }
  return branchesList;
};

export const createBranch = async (repoId, userId, branchName) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId.toString()) throw new AppError('Unauthorized', 401);

  if (!branchName || typeof branchName !== 'string' || !branchName.trim()) {
    throw new AppError('Invalid branch name', 400);
  }

  const cleanName = branchName.trim();
  
  if (!repo.branches || repo.branches.length === 0) {
    repo.branches = ['main'];
  } else if (!repo.branches.includes('main')) {
    repo.branches.unshift('main');
  }

  if (repo.branches.includes(cleanName)) {
    throw new AppError('Branch already exists', 400);
  }

  repo.branches.push(cleanName);
  await repo.save();
  return repo.branches;
};

export const getTags = async (repoId, viewerId) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.visibility === 'private' && (!viewerId || repo.owner.toString() !== viewerId.toString())) {
    throw new AppError('Unauthorized', 403);
  }
  return repo.tags || [];
};

export const createTag = async (repoId, userId, tagName) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId.toString()) throw new AppError('Unauthorized', 401);

  if (!tagName || typeof tagName !== 'string' || !tagName.trim()) {
    throw new AppError('Invalid tag name', 400);
  }

  const cleanName = tagName.trim();
  if (repo.tags.includes(cleanName)) {
    throw new AppError('Tag already exists', 400);
  }

  repo.tags.push(cleanName);
  await repo.save();
  return repo.tags;
};

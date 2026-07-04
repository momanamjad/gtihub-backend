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

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const GITIGNORE_TEMPLATES = {
  node: `node_modules/
npm-debug.log
.env
dist/
target/
.DS_Store
`,
  python: `__pycache__/
*.pyc
*.pyo
*.pyd
.venv/
env/
venv/
`,
  java: `*.class
*.log
*.jar
*.war
target/
.idea/
.gradle/
build/
`,
  react: `node_modules/
build/
.env.local
.env.development.local
.env.test.local
.env.production.local
npm-debug.log*
yarn-debug.log*
yarn-error.log*
`,
  vue: `node_modules/
dist/
.env.local
`,
  angular: `node_modules/
dist/
tmp/
`,
  go: `bin/
pkg/
src/
`,
  swift: `.build/
Packages/
.DS_Store
`,
  kotlin: `*.class
target/
build/
`,
};

export const createRepository = async (userId, repoData) => {
  const repo = new Repository({ 
    ...repoData, 
    owner: userId 
  });
  await repo.save();

  const user = await User.findById(userId);
  const username = user?.login || 'unknown';
  const commitHash = Math.random().toString(16).substring(2, 9);

  const filesToInsert = [];
  const hasInitialFiles = repoData.addReadme || repoData.gitignoreTemplate || repoData.license;

  if (hasInitialFiles) {
    if (repoData.addReadme) {
      filesToInsert.push({ 
        repository: repo._id, 
        branch: 'main',
        type: 'dir', 
        name: 'src', 
        path: 'src', 
        parentPath: '', 
        lastCommitMessage: 'Initial commit', 
        lastCommitAuthor: username, 
        lastCommitDate: new Date() 
      });
      filesToInsert.push({ 
        repository: repo._id, 
        branch: 'main',
        type: 'file', 
        name: 'README.md', 
        path: 'README.md', 
        content: `# ${repoData.name}\n${repoData.description || ''}\n`, 
        parentPath: '', 
        lastCommitMessage: 'Initial commit', 
        lastCommitAuthor: username, 
        lastCommitDate: new Date() 
      });
    }

    if (repoData.gitignoreTemplate) {
      const templateName = repoData.gitignoreTemplate.toLowerCase();
      const content = GITIGNORE_TEMPLATES[templateName] || `# .gitignore for ${templateName}\nnode_modules/\n`;
      filesToInsert.push({ 
        repository: repo._id, 
        branch: 'main',
        type: 'file', 
        name: '.gitignore', 
        path: '.gitignore', 
        content: content, 
        parentPath: '', 
        lastCommitMessage: 'Initial commit', 
        lastCommitAuthor: username, 
        lastCommitDate: new Date() 
      });
    }

    if (repoData.license) {
      const licenseName = repoData.license.toLowerCase();
      const year = new Date().getFullYear();
      let content = "";
      if (licenseName.includes("mit")) {
        content = `MIT License

Copyright (c) ${year} ${username}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
      } else if (licenseName.includes("apache")) {
        content = `Apache License 2.0

Copyright (c) ${year} ${username}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`;
      } else {
        content = `${repoData.license}

Copyright (c) ${year} ${username}
All rights reserved.`;
      }
      filesToInsert.push({ 
        repository: repo._id, 
        branch: 'main',
        type: 'file', 
        name: 'LICENSE', 
        path: 'LICENSE', 
        content: content, 
        parentPath: '', 
        lastCommitMessage: 'Initial commit', 
        lastCommitAuthor: username, 
        lastCommitDate: new Date() 
      });
    }

    await FileNode.insertMany(filesToInsert);
    
    // Record contribution only if files are created (initial commit)
    await recordContribution(userId, 'repo_created', repo._id, {
      commitMessage: 'Initial commit',
      commitAuthor: username,
      commitHash
    });
  }

  await User.findByIdAndUpdate(userId, { $inc: { public_repos_count: 1 } });
  
  return repo;
};

export const getUserRepositories = async (userId, { page = 1, limit = 10, sort = '-created_at' }) => {
  const skip = (page - 1) * limit;
  const repos = await Repository.find({ owner: userId, is_deleted: false })
    .select('-fileTree -branches -tags')
    .populate('owner', 'login name avatar_url')
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Repository.countDocuments({ owner: userId, is_deleted: false });

  return { repos, total };
};

export const getPublicRepositories = async ({ page = 1, limit = 10, sort = '-created_at', language = null }) => {
  const skip = (page - 1) * limit;
  const query = { visibility: 'public', is_deleted: false };
  
  if (language) query.language = language;

  const repos = await Repository.find(query)
    .select('-fileTree -branches -tags')
    .populate('owner', 'login avatar_url')
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Repository.countDocuments(query);

  return { repos, total };
};

export const getRepositoryById = async (repoId, viewerId) => {
  const repo = await Repository.findById(repoId)
    .populate('owner', 'login avatar_url followers_count')
    .populate('issues_count')
    .lean();

  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);

  const ownerId = repo.owner?._id || repo.owner;
  if (repo.visibility === 'private' && (!viewerId || ownerId.toString() !== viewerId.toString())) {
    throw new AppError('Unauthorized access to private repository', 403);
  }
  
  const repoObj = repo;
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

  // Record contribution
  await recordContribution(userId, 'repo_starred', repoId);

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
  const query = { is_deleted: false };
  
  // Default to public visibility unless specifically searched
  query.visibility = 'public';

  let searchString = q || "";

  // Parse stars:>N or stars:<N
  const starsMatch = searchString.match(/stars:([><=]\d+)/);
  if (starsMatch) {
    const op = starsMatch[1][0];
    const val = parseInt(starsMatch[1].substring(1), 10);
    if (op === '>') query.stars_count = { $gt: val };
    else if (op === '<') query.stars_count = { $lt: val };
    searchString = searchString.replace(/stars:[><=]\d+/, '').trim();
  }

  // Parse forks:>N or forks:<N
  const forksMatch = searchString.match(/forks:([><=]\d+)/);
  if (forksMatch) {
    const op = forksMatch[1][0];
    const val = parseInt(forksMatch[1].substring(1), 10);
    if (op === '>') query.forks_count = { $gt: val };
    else if (op === '<') query.forks_count = { $lt: val };
    searchString = searchString.replace(/forks:[><=]\d+/, '').trim();
  }

  // Parse language:Lang
  const langMatch = searchString.match(/language:([^\s]+)/);
  if (langMatch) {
    query.language = new RegExp('^' + escapeRegex(langMatch[1]) + '$', 'i');
    searchString = searchString.replace(/language:[^\s]+/, '').trim();
  } else if (language) {
    query.language = new RegExp('^' + escapeRegex(language) + '$', 'i');
  }

  // Parse visibility:Visibility
  const visMatch = searchString.match(/visibility:([^\s]+)/);
  if (visMatch) {
    const vis = visMatch[1].toLowerCase();
    if (vis === 'public' || vis === 'private') {
      query.visibility = vis;
    }
    searchString = searchString.replace(/visibility:[^\s]+/, '').trim();
  }

  let dbQuery = Repository.find(query);
  if (searchString) {
    dbQuery = dbQuery.find({ $text: { $search: searchString } });
  }

  const repos = await dbQuery
    .populate('owner', 'login avatar_url')
    .skip(skip)
    .limit(limit);

  const countQuery = { ...query };
  if (searchString) {
    countQuery.$text = { $search: searchString };
  }
  const total = await Repository.countDocuments(countQuery);

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

  const allowedFields = ['title', 'description', 'state', 'labels', 'assignee', 'milestone'];
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

const buildBranchQuery = (repoId, branch, extra = {}) => {
  const query = { repository: repoId, ...extra };
  if (branch === 'main') {
    query.$or = [{ branch: 'main' }, { branch: { $exists: false } }, { branch: null }];
  } else {
    query.branch = branch;
  }
  return query;
};

export const getRepoFileTree = async (repoId, viewerId, branch = 'main') => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.visibility === 'private' && (!viewerId || repo.owner.toString() !== viewerId.toString())) {
    throw new AppError('Unauthorized', 403);
  }

  const query = buildBranchQuery(repoId, branch);
  const flatNodes = await FileNode.find(query).lean();
  
  const buildTree = (parentPath = '') => {
    return flatNodes
      .filter(n => n.parentPath === parentPath)
      .map(n => {
        const item = {
          _id: n._id,
          name: n.name,
          path: n.path,
          type: n.type,
          content: n.content,
          lastCommitMessage: n.lastCommitMessage || 'Initial commit',
          lastCommitAuthor: n.lastCommitAuthor || 'unknown',
          lastCommitDate: n.lastCommitDate || n.updated_at || new Date()
        };
        if (n.type === 'dir') {
          item.children = buildTree(n.path);
        }
        return item;
      });
  };

  return buildTree('');
};

const propagateDirectoryCommit = async (repoId, branch, parentPath, commitMessage, commitAuthor, commitDate) => {
  if (!parentPath) return;
  const parts = parentPath.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const currentDirPath = parts.slice(0, i).join('/');
    const query = buildBranchQuery(repoId, branch, { path: currentDirPath, type: 'dir' });
    await FileNode.findOneAndUpdate(
      query,
      { 
        lastCommitMessage: commitMessage, 
        lastCommitAuthor: commitAuthor, 
        lastCommitDate: commitDate 
      }
    );
  }
};

export const addRepoFileNode = async (repoId, userId, { name, path, type, content, parentPath, commitMessage, branch = 'main' }) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId.toString()) throw new AppError('Unauthorized', 401);

  const query = buildBranchQuery(repoId, branch, { path });
  const existing = await FileNode.findOne(query);
  if (existing) throw new AppError('File or directory already exists', 400);

  const user = await User.findById(userId);
  const username = user?.login || 'unknown';
  const msg = commitMessage || `Create ${name}`;
  const commitDate = new Date();
  const commitHash = Math.random().toString(16).substring(2, 9);

  const node = new FileNode({ 
    repository: repoId, 
    branch,
    name, 
    path, 
    type, 
    content, 
    parentPath,
    lastCommitMessage: msg,
    lastCommitAuthor: username,
    lastCommitDate: commitDate
  });
  await node.save();

  // Propagate commit message to parent directories recursively
  await propagateDirectoryCommit(repoId, branch, parentPath, msg, username, commitDate);
  
  // Record contribution
  await recordContribution(userId, 'file_created', repoId, {
    commitMessage: msg,
    commitAuthor: username,
    commitHash
  });
  
  return node;
};

export const updateRepoFileNode = async (repoId, userId, oldPath, { name, path, content, commitMessage, branch = 'main' }) => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId.toString()) throw new AppError('Unauthorized', 401);

  const query = buildBranchQuery(repoId, branch, { path: oldPath });
  const node = await FileNode.findOne(query);
  if (!node) throw new AppError('File not found', 404);

  const user = await User.findById(userId);
  const username = user?.login || 'unknown';
  const msg = commitMessage || `Update ${node.name}`;
  const commitDate = new Date();
  const commitHash = Math.random().toString(16).substring(2, 9);

  if (name) node.name = name;
  if (path) {
    const oldPrefix = oldPath + '/';
    const newPrefix = path + '/';
    const childrenQuery = buildBranchQuery(repoId, branch, { path: new RegExp('^' + escapeRegex(oldPrefix)) });
    const children = await FileNode.find(childrenQuery);
    for (const child of children) {
      child.path = child.path.replace(oldPrefix, newPrefix);
      child.parentPath = child.parentPath.replace(oldPath, path);
      child.lastCommitMessage = msg;
      child.lastCommitAuthor = username;
      child.lastCommitDate = commitDate;
      await child.save();
    }
    node.path = path;
    node.parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
  }
  if (content !== undefined) node.content = content;

  node.lastCommitMessage = msg;
  node.lastCommitAuthor = username;
  node.lastCommitDate = commitDate;

  await node.save();

  // Propagate commit message to parent directories recursively
  await propagateDirectoryCommit(repoId, branch, node.parentPath, msg, username, commitDate);
  
  // Record contribution
  await recordContribution(userId, 'file_updated', repoId, {
    commitMessage: msg,
    commitAuthor: username,
    commitHash
  });
  
  return node;
};

export const deleteRepoFileNode = async (repoId, userId, path, branch = 'main') => {
  const repo = await Repository.findById(repoId);
  if (!repo || repo.is_deleted) throw new AppError('Repository not found', 404);
  if (repo.owner.toString() !== userId.toString()) throw new AppError('Unauthorized', 401);

  const query = buildBranchQuery(repoId, branch, { path });
  const node = await FileNode.findOne(query);
  if (!node) throw new AppError('File not found', 404);

  if (node.type === 'dir') {
    const childrenQuery = buildBranchQuery(repoId, branch, { path: new RegExp('^' + escapeRegex(path) + '(/|$)') });
    await FileNode.deleteMany(childrenQuery);
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

  // Clone base branch's file tree to the new branch
  const baseBranch = repo.branches.includes('main') ? 'main' : repo.branches[0] || 'main';
  const baseQuery = buildBranchQuery(repoId, baseBranch);
  const baseNodes = await FileNode.find(baseQuery).lean();
  const newNodes = baseNodes.map(node => {
    const { _id, createdAt, updatedAt, ...rest } = node;
    return {
      ...rest,
      branch: cleanName
    };
  });
  if (newNodes.length > 0) {
    await FileNode.insertMany(newNodes);
  }

  repo.branches.push(cleanName);
  await repo.save();
  return repo.branches;
};

export const compareBranches = async (repoId, sourceBranch, targetBranch) => {
  const sourceQuery = buildBranchQuery(repoId, sourceBranch, { type: 'file' });
  const targetQuery = buildBranchQuery(repoId, targetBranch, { type: 'file' });
  const sourceNodes = await FileNode.find(sourceQuery).lean();
  const targetNodes = await FileNode.find(targetQuery).lean();

  const sourceMap = new Map(sourceNodes.map(n => [n.path, n]));
  const targetMap = new Map(targetNodes.map(n => [n.path, n]));

  const diffs = [];

  // Find added and modified files
  for (const [path, sourceNode] of sourceMap.entries()) {
    const targetNode = targetMap.get(path);
    if (!targetNode) {
      // Added file
      diffs.push({
        path,
        status: 'added',
        additions: sourceNode.content.split('\n').length,
        deletions: 0,
        diffLines: sourceNode.content.split('\n').map((line, idx) => ({ type: 'addition', content: line, number: idx + 1 }))
      });
    } else if (sourceNode.content !== targetNode.content) {
      // Modified file
      const sourceLines = sourceNode.content.split('\n');
      const targetLines = targetNode.content.split('\n');
      const diffLines = [];
      let additions = 0;
      let deletions = 0;

      // Show old lines as deleted, new lines as added
      targetLines.forEach((line, idx) => {
        diffLines.push({ type: 'deletion', content: line, number: idx + 1 });
        deletions++;
      });
      sourceLines.forEach((line, idx) => {
        diffLines.push({ type: 'addition', content: line, number: idx + 1 });
        additions++;
      });

      diffs.push({
        path,
        status: 'modified',
        additions,
        deletions,
        diffLines
      });
    }
  }

  // Find deleted files
  for (const [path, targetNode] of targetMap.entries()) {
    if (!sourceMap.has(path)) {
      diffs.push({
        path,
        status: 'deleted',
        additions: 0,
        deletions: targetNode.content.split('\n').length,
        diffLines: targetNode.content.split('\n').map((line, idx) => ({ type: 'deletion', content: line, number: idx + 1 }))
      });
    }
  }

  return diffs;
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

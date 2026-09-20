import express from 'express';
import Repository from '../models/repository.js';
import User from '../models/user.js';
import Issue from '../models/issue.js';
import PullRequest from '../models/pullRequest.js';
import { optionalAuth } from '../middleware/auth.js';
import { successResponse } from '../utils/responseFormatter.js';
import { asyncHandler } from '../utils/errorHandler.js';
import { parseSearchQuery } from '../utils/searchParser.js';

const router = express.Router();

function escapeRegex(string) {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { q = "" } = req.query;
  const filters = parseSearchQuery(q);
  const textQuery = escapeRegex(filters.text || "");

  const results = {
    repositories: [],
    users: [],
    issues: [],
    pullRequests: [],
    counts: {
      repositories: 0,
      users: 0,
      issues: 0,
      pullRequests: 0
    }
  };

  // Base text filters
  const textSearchFilter = textQuery ? { 
    $or: [
      { name: { $regex: textQuery, $options: 'i' } },
      { description: { $regex: textQuery, $options: 'i' } },
      { title: { $regex: textQuery, $options: 'i' } },
      { login: { $regex: textQuery, $options: 'i' } }
    ]
  } : {};

  // Determine which categories to query based on "is:" parameter
  const queryAll = !filters.is;
  const queryRepos = queryAll || filters.is === 'repo' || filters.is === 'repository';
  const queryUsers = queryAll || filters.is === 'user';
  const queryIssues = queryAll || filters.is === 'issue';
  const queryPRs = queryAll || filters.is === 'pr' || filters.is === 'pull';

  // Helper to fetch visible repo IDs once for issues and PRs
  const getVisibleRepoIds = async () => {
    const visibleRepoQuery = { is_deleted: false };
    if (!req.user) {
      visibleRepoQuery.visibility = 'public';
    } else {
      visibleRepoQuery.$or = [
        { visibility: 'public' },
        { owner: req.user.id }
      ];
    }
    const repos = await Repository.find(visibleRepoQuery).select('_id').lean();
    return repos.map(r => r._id);
  };

  const tasks = [];

  // 1. Query Repositories
  if (queryRepos) {
    tasks.push((async () => {
      const repoQuery = { is_deleted: false };
      if (textQuery) {
        repoQuery.$or = [
          { name: { $regex: textQuery, $options: 'i' } },
          { description: { $regex: textQuery, $options: 'i' } }
        ];
      }
      if (filters.user || filters.owner) {
        const ownerName = escapeRegex(filters.user || filters.owner);
        const ownerUsers = await User.find({ login: { $regex: ownerName, $options: 'i' } }).select('_id').lean();
        repoQuery.owner = { $in: ownerUsers.map(u => u._id) };
      }
      if (filters.language) {
        repoQuery.language = { $regex: escapeRegex(filters.language), $options: 'i' };
      }
      if (filters.visibility) {
        repoQuery.visibility = filters.visibility;
      } else {
        const viewerId = req.user?.id;
        if (viewerId) {
          repoQuery.$or = [
            { visibility: 'public' },
            { owner: viewerId }
          ];
        } else {
          repoQuery.visibility = 'public';
        }
      }

      const [repos, count] = await Promise.all([
        Repository.find(repoQuery)
          .populate('owner', 'login avatar_url')
          .limit(30)
          .lean(),
        Repository.countDocuments(repoQuery)
      ]);
      results.repositories = repos;
      results.counts.repositories = count;
    })());
  }

  // 2. Query Users
  if (queryUsers) {
    tasks.push((async () => {
      const userQuery = {};
      if (textQuery) {
        userQuery.$or = [
          { login: { $regex: textQuery, $options: 'i' } },
          { name: { $regex: textQuery, $options: 'i' } }
        ];
      }
      const [users, count] = await Promise.all([
        User.find(userQuery)
          .select('login name avatar_url followers_count public_repos_count bio')
          .limit(30)
          .lean(),
        User.countDocuments(userQuery)
      ]);
      results.users = users;
      results.counts.users = count;
    })());
  }

  // Deduplicate visible repos query for Issues and PRs
  const visibleRepoIdsPromise = (queryIssues || queryPRs) ? getVisibleRepoIds() : null;

  // 3. Query Issues
  if (queryIssues) {
    tasks.push((async () => {
      const issueQuery = { is_deleted: false };
      if (textQuery) {
        issueQuery.$or = [
          { title: { $regex: textQuery, $options: 'i' } },
          { description: { $regex: textQuery, $options: 'i' } }
        ];
      }
      if (filters.state) {
        issueQuery.state = filters.state;
      }

      const visibleRepoIds = await visibleRepoIdsPromise;
      issueQuery.repository = { $in: visibleRepoIds };

      const [issues, count] = await Promise.all([
        Issue.find(issueQuery)
          .populate('creator', 'login avatar_url')
          .populate('repository', 'name owner')
          .limit(30)
          .lean(),
        Issue.countDocuments(issueQuery)
      ]);
      results.issues = issues;
      results.counts.issues = count;
    })());
  }

  // 4. Query Pull Requests
  if (queryPRs) {
    tasks.push((async () => {
      const prQuery = {};
      if (textQuery) {
        prQuery.$or = [
          { title: { $regex: textQuery, $options: 'i' } },
          { description: { $regex: textQuery, $options: 'i' } }
        ];
      }
      if (filters.state) {
        prQuery.status = filters.state;
      }

      const visibleRepoIds = await visibleRepoIdsPromise;
      prQuery.repository = { $in: visibleRepoIds };

      const [prs, count] = await Promise.all([
        PullRequest.find(prQuery)
          .populate('author', 'login avatar_url')
          .populate('repository', 'name owner')
          .limit(30)
          .lean(),
        PullRequest.countDocuments(prQuery)
      ]);
      results.pullRequests = prs;
      results.counts.pullRequests = count;
    })());
  }

  await Promise.all(tasks);

  successResponse(res, results);
}));

export default router;

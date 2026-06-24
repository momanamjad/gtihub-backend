import express from 'express';
import { auth, optionalAuth } from '../middleware/auth.js';
import Repository from '../models/repository.js';
import Issue from '../models/issue.js';
import PullRequest from '../models/pullRequest.js';
import { successResponse } from '../utils/responseFormatter.js';
import { asyncHandler } from '../utils/errorHandler.js';

const router = express.Router();

// Context-aware chat endpoint
router.post('/chat', optionalAuth, asyncHandler(async (req, res) => {
  const { message, history = [], repoId } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ message: 'message is required and must be a string' });
  }

  let contextInfo = "";

  if (repoId) {
    const repo = await Repository.findById(repoId).populate('owner', 'login');
    if (repo) {
      contextInfo += `You are looking at the repository "${repo.owner?.login || 'unknown'}/${repo.name}".\n`;
      contextInfo += `Description: ${repo.description || 'None'}\n`;
      contextInfo += `Visibility: ${repo.visibility}\n`;

      // Get count of issues
      const issueCount = await Issue.countDocuments({ repository: repoId, is_deleted: false });
      // Get count of pull requests
      const prCount = await PullRequest.countDocuments({ repository: repoId, status: 'open' });

      contextInfo += `Open Issues: ${issueCount}\n`;
      contextInfo += `Open Pull Requests: ${prCount}\n`;
    }
  }

  // Generate simulated AI response based on context
  let responseText = "";
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes("explain") || lowerMsg.includes("what is")) {
    if (repoId) {
      responseText = `Based on the repository context, this is a **${repoId ? 'configured' : 'mock'} project**. From the structure, it appears to contain standard configuration files like \`package.json\`, code source directories (\`src/\`), and assets. Let me know if you would like me to analyze a specific file!`;
    } else {
      responseText = "This repository seems to be a GitHub Clone project. It contains a fully functional front-end layout styling similar to GitHub, and a Node.js/Express backend API connected to MongoDB storing users, repositories, pull requests, issues, and discussions.";
    }
  } else if (lowerMsg.includes("issue") || lowerMsg.includes("bug")) {
    if (repoId) {
      const issues = await Issue.find({ repository: repoId, is_deleted: false }).limit(3);
      if (issues.length > 0) {
        responseText = `Here are some active issues in this repository:\n\n` +
          issues.map(i => `- **#${i.number}**: ${i.title} (${i.state || 'open'})`).join('\n') +
          `\n\nWould you like me to help resolve any of these?`;
      } else {
        responseText = "There are currently no active issues reported in this repository. You can create a new issue in the **Issues** tab if you've encountered any problems!";
      }
    } else {
      responseText = "Issues track bugs, tasks, and feature requests. You can open them in any repository to start a discussion.";
    }
  } else if (lowerMsg.includes("how to run") || lowerMsg.includes("install")) {
    responseText = "To run this application locally:\n1. Run `npm install` in both `github` (frontend) and `github-backend` directories.\n2. Create a `.env` file in the backend with `MONGODB_URI` and `JWT_SECRET`.\n3. Run `npm run dev` to start the local frontend dev server.";
  } else {
    responseText = `Hello! I am your AI Copilot. I'm ready to help you write code, write tests, or analyze this repository. ${repoId ? "I have loaded the context of the current repository." : "Select a repository to get context-aware answers!"}`;
  }

  successResponse(res, { response: responseText });
}));

export default router;

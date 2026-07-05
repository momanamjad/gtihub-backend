import express from 'express';
import { optionalAuth } from '../middleware/auth.js';
import Repository from '../models/repository.js';
import Issue from '../models/issue.js';
import PullRequest from '../models/pullRequest.js';
import FileNode from '../models/fileNode.js';
import { successResponse } from '../utils/responseFormatter.js';
import { asyncHandler } from '../utils/errorHandler.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Context-aware chat endpoint using real Gemini AI
router.post('/chat', optionalAuth, asyncHandler(async (req, res) => {
  const { message, history = [], repoId } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ message: 'message is required and must be a string' });
  }

  // Fallback if API key is not configured
  if (!genAI) {
    return successResponse(res, {
      response: `⚠️ **Gemini API Key is not configured on the backend.**\n\nTo enable real AI conversations, please add \`GEMINI_API_KEY\` to your backend \`.env\` file.\n\n*Fallback response to your prompt:* "${message}" is received! This is the offline fallback helper.`
    });
  }

  let contextInfo = "";
  let fileContentContext = "";

  if (repoId) {
    const repo = await Repository.findById(repoId).populate('owner', 'login');
    if (repo) {
      contextInfo += `You are looking at the repository "${repo.owner?.login || 'unknown'}/${repo.name}".\n`;
      contextInfo += `Description: ${repo.description || 'None'}\n`;
      contextInfo += `Visibility: ${repo.visibility}\n`;

      // Get count of issues and pull requests
      const issueCount = await Issue.countDocuments({ repository: repoId, is_deleted: false });
      const prCount = await PullRequest.countDocuments({ repository: repoId, status: 'open' });

      contextInfo += `Open Issues: ${issueCount}\n`;
      contextInfo += `Open Pull Requests: ${prCount}\n`;

      // Fetch file tree structure
      const files = await FileNode.find({ repository: repoId }).select('name path type content').lean();
      if (files && files.length > 0) {
        contextInfo += `File Tree Structure:\n`;
        files.forEach(f => {
          contextInfo += `- ${f.path} (${f.type})\n`;
        });

        // Scan if user is referencing any specific file in their query
        let fileCountIncluded = 0;
        for (const file of files) {
          if (file.type === 'file' && file.content) {
            const hasMention = message.toLowerCase().includes(file.name.toLowerCase()) || 
                               message.toLowerCase().includes(file.path.toLowerCase());
            if (hasMention && fileCountIncluded < 3) {
              fileContentContext += `Content of referenced file "${file.path}":\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
              fileCountIncluded++;
            }
          }
        }
      }
    }
  }

  // Map incoming history to Gemini roles: user -> user, assistant -> model
  const geminiHistory = (history || [])
    .filter(h => h.role === 'user' || h.role === 'assistant')
    .map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

  const systemInstruction = `You are GitHub Copilot, a helpful AI pair programmer coding assistant.
You are embedded in a custom GitHub clone application.
You help users with their questions about the code, repository structure, issues, pull requests, and software development.
Always respond with professional, clean, and concise software engineering advice.
Use clean Markdown formatting, using code blocks with appropriate language tags for code snippets.

Here is the current repository context:
${contextInfo}
${fileContentContext}
`;

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction,
    });

    const chat = model.startChat({
      history: geminiHistory,
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();

    successResponse(res, { response: responseText });
  } catch (err) {
    console.error('[Copilot Service Error]:', err.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate response from Gemini API: ' + err.message
    });
  }
}));

export default router;

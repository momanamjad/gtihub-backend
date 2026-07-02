import WorkflowRun from '../models/workflowRun.js';

export const triggerWorkflowRun = async (repoId, branch) => {
  try {
    const mockLogs = [
      "🚀 Starting build environment on runner host UBUNTU-LATEST...",
      "🔧 Setup Node.js environment version v20.11.0...",
      "📦 Loading dependency caching layers from cache key: node-modules-v1...",
      "📥 Executing npm clean-install (npm ci)...",
      "added 1204 packages in 4.25s",
      "🧪 Executing unit test suite: npm run test...",
      "PASS  src/tests/auth.test.js (5.42s)",
      "PASS  src/tests/repos.test.js (3.11s)",
      "✔ All unit and integration test runs passed successfully (18 tests)",
      "🔧 Compiling production asset bundle: npm run build...",
      "vite v7.3.3 building client environment for production...",
      "transforming modules...",
      "✓ 2513 modules transformed.",
      "✓ production bundle compiled in 11.24s",
      "🎉 Frontend bundle created successfully!",
      "🚀 Launching deploy deployment task to edge network host...",
      "📦 Syncing build assets with remote storage...",
      "✅ Deployment live: https://github-kappa-two.vercel.app",
      `🎉 Pipeline workflow run finished successfully for branch ${branch || 'main'} with exit status: 0.`
    ];

    const run = new WorkflowRun({
      repository: repoId,
      name: 'CI/CD Build & Deploy',
      branch: branch || 'main',
      status: 'success',
      logs: mockLogs
    });

    await run.save();
    return run;
  } catch (err) {
    console.error('Error triggering automated workflow run:', err);
    return null;
  }
};

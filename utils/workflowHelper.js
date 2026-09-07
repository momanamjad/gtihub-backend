import WorkflowRun from '../models/workflowRun.js';
import { actionsQueue } from '../services/actionsQueue.js';

export const triggerWorkflowRun = async (repoId, branch) => {
  try {
    const run = new WorkflowRun({
      repository: repoId,
      name: 'CI/CD Pipeline',
      branch: branch || 'main',
      status: 'queued',
      logs: [`[${new Date().toISOString()}] Workflow enqueued...`]
    });

    await run.save();
    
    // Add to BullMQ queue
    await actionsQueue.add('run_workflow', {
      runId: run._id,
      repoId,
      branch: branch || 'main'
    });
    
    return run;
  } catch (err) {
    console.error('Error triggering automated workflow run:', err);
    return null;
  }
};

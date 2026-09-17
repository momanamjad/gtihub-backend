import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import Docker from 'dockerode';
import * as jsyaml from 'js-yaml';
import WorkflowRun from '../models/workflowRun.js';
import FileNode from '../models/fileNode.js';
import Repository from '../models/repository.js';
import { notificationEmitter } from '../utils/eventEmitter.js'; // to broadcast WebSocket logs

const isVercel = !!process.env.VERCEL;
const redisUrl = process.env.REDIS_URI || process.env.REDIS_URL;

let connection = null;
let docker = null;
let actionsQueue = {
  add: async () => {
    console.log('Redis actions queue not configured or running in serverless mode. Skipping job addition.');
  }
};
let worker = null;

if (!isVercel && redisUrl) {
  try {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    connection.on('error', (err) => {
      console.warn('⚠️ Actions Redis connection warning:', err.message);
    });
    docker = new Docker(); // Connects to local Docker daemon
    actionsQueue = new Queue('actions', { connection });
  } catch (err) {
    console.warn('⚠️ Failed to initialize Actions BullMQ queue:', err.message);
  }
}

export { actionsQueue };

// Function to log and emit
const appendLog = async (runId, message) => {
  const line = `[${new Date().toISOString()}] ${message}`;
  await WorkflowRun.findByIdAndUpdate(runId, {
    $push: { logs: line }
  });
  // Emit to socket room for live viewing
  notificationEmitter.emit('action_log', { runId, log: line });
};

const executeStep = async (step, container, runId) => {
  if (step.run) {
    await appendLog(runId, `Running step: ${step.name || 'Run cmd'}`);
    
    // Execute command in container
    const exec = await container.exec({
      Cmd: ['sh', '-c', step.run],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false
    });

    const stream = await exec.start();
    
    return new Promise((resolve, reject) => {
      stream.on('data', async (chunk) => {
        const text = chunk.toString('utf8').trim();
        if (text) {
          await appendLog(runId, text);
        }
      });
      
      stream.on('end', async () => {
        const inspect = await exec.inspect();
        if (inspect.ExitCode !== 0) {
          reject(new Error(`Step failed with exit code ${inspect.ExitCode}`));
        } else {
          resolve();
        }
      });
      
      stream.on('error', reject);
    });
  }
};

if (connection && docker && !isVercel) {
  try {
    worker = new Worker('actions', async job => {
      const { runId, repoId, branch } = job.data;
      let container = null;
      
      try {
        const run = await WorkflowRun.findById(runId);
        if (!run) return;

        run.status = 'in_progress';
        await run.save();
        
        await appendLog(runId, `Starting workflow run for ${branch}`);

        // Fetch workflows from DB (in .github/workflows/)
        const workflowFiles = await FileNode.find({
          repository: repoId,
          branch: branch,
          path: { $regex: /^\.github\/workflows\/.*\.yml$/ }
        });

        if (workflowFiles.length === 0) {
          await appendLog(runId, `No workflows found in .github/workflows/`);
          run.status = 'success';
          await run.save();
          return;
        }

        // Process the first workflow for simplicity in this MVP
        const wfNode = workflowFiles[0];
        await appendLog(runId, `Found workflow: ${wfNode.name}`);
        
        let parsedWf;
        try {
          parsedWf = jsyaml.load(wfNode.content);
        } catch (e) {
          await appendLog(runId, `Failed to parse YAML: ${e.message}`);
          throw new Error('Invalid YAML');
        }

        // Pull base image (assume node:18-alpine by default)
        const image = 'node:18-alpine';
        await appendLog(runId, `Pulling image ${image}...`);
        await new Promise((resolve, reject) => {
          docker.pull(image, (err, stream) => {
            if (err) return reject(err);
            docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
          });
        });

        // Create container
        await appendLog(runId, `Creating container...`);
        container = await docker.createContainer({
          Image: image,
          Cmd: ['tail', '-f', '/dev/null'],
          Tty: true
        });
        
        await container.start();
        await appendLog(runId, `Container started. Loading repository files...`);

        // Inject all repo files into the container workspace
        const allFiles = await FileNode.find({ repository: repoId, branch, type: 'file' });
        for (const file of allFiles) {
          const escapedPath = file.path.replace(/"/g, '\\"');
          const createDir = `mkdir -p "$(dirname "${escapedPath}")"`;
          
          const execDir = await container.exec({ Cmd: ['sh', '-c', createDir] });
          await execDir.start();

          // Simple echo injection (Not robust for binaries, but fine for text source files)
          const base64Content = Buffer.from(file.content || '').toString('base64');
          const injectCmd = `echo "${base64Content}" | base64 -d > "${escapedPath}"`;
          
          const execInject = await container.exec({ Cmd: ['sh', '-c', injectCmd] });
          await execInject.start();
        }

        await appendLog(runId, `Repository files loaded.`);

        // Run Jobs
        const jobs = parsedWf.jobs || {};
        for (const [jobId, jobDef] of Object.entries(jobs)) {
          await appendLog(runId, `Running job: ${jobId}`);
          const steps = jobDef.steps || [];
          for (const step of steps) {
            await executeStep(step, container, runId);
          }
        }

        run.status = 'success';
        await run.save();
        await appendLog(runId, `Workflow completed successfully.`);

      } catch (error) {
        console.error('Job failed:', error);
        await appendLog(runId, `Workflow failed: ${error.message}`);
        await WorkflowRun.findByIdAndUpdate(runId, { status: 'failure' });
      } finally {
        if (container) {
          await container.stop().catch(() => {});
          await container.remove({ force: true }).catch(() => {});
        }
      }
    }, { connection });

    worker.on('failed', (job, err) => {
      console.error(`Action Job ${job.id} failed:`, err);
    });
    worker.on('error', (err) => {
      console.warn(`⚠️ Action Worker error:`, err.message);
    });
  } catch (err) {
    console.warn('⚠️ Could not start Action Worker:', err.message);
  }
}

export { worker };

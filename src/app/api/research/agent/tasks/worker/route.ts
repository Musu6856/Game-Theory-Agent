import { runAgentTaskWorkerRoute } from "@/lib/research-agent/task-worker-route";

export async function GET(request: Request) {
  return runWorker(request);
}

export async function POST(request: Request) {
  return runWorker(request);
}

function runWorker(request: Request) {
  return runAgentTaskWorkerRoute({
    request,
    secrets: [process.env.AGENT_TASK_WORKER_SECRET, process.env.CRON_SECRET],
  });
}

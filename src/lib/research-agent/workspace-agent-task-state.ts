import type { AgentTask } from "../types";

export function isAgentTaskInProgress(task: AgentTask, now = Date.now()) {
  if (task.status === "queued") return true;
  if (task.status !== "running") return false;
  return typeof task.leaseUntil !== "number" || task.leaseUntil > now;
}

function isTerminalAgentTask(task: AgentTask) {
  return task.status === "completed" || task.status === "failed" || task.status === "cancelled";
}

export function selectVisibleActiveAgentTask({
  activeTask,
  tasks,
  projectId,
  now = Date.now(),
}: {
  activeTask?: AgentTask | null;
  tasks: AgentTask[];
  projectId?: string;
  now?: number;
}) {
  if (!projectId) return null;

  const latestServerTask =
    tasks
      .filter((task) => task.projectId === projectId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .at(0) ?? null;

  if (
    latestServerTask &&
    activeTask?.id === latestServerTask.id &&
    isTerminalAgentTask(latestServerTask)
  ) {
    return null;
  }

  if (
    latestServerTask &&
    activeTask?.id === latestServerTask.id &&
    latestServerTask.updatedAt >= activeTask.updatedAt
  ) {
    return isAgentTaskInProgress(latestServerTask, now)
      ? latestServerTask
      : null;
  }

  if (
    activeTask?.projectId === projectId &&
    isAgentTaskInProgress(activeTask, now)
  ) {
    return activeTask;
  }

  return latestServerTask && isAgentTaskInProgress(latestServerTask, now)
    ? latestServerTask
    : null;
}

import type { AgentTask } from "../types";

export function isRecoverableAgentTask(task: AgentTask, now = Date.now()) {
  if (task.status === "queued") return true;
  if (task.status !== "running") return false;
  return typeof task.leaseUntil !== "number" || task.leaseUntil <= now;
}

export function selectRecoverableAgentTaskForProject(
  tasks: AgentTask[],
  projectId: string,
  now = Date.now()
) {
  return (
    tasks
      .filter(
        (task) =>
          task.projectId === projectId && isRecoverableAgentTask(task, now)
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .at(0) ?? null
  );
}

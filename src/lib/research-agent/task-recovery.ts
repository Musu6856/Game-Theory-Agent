import type { AgentTask } from "../types";

export function isRecoverableAgentTask(task: AgentTask) {
  return task.status === "queued" || task.status === "running";
}

export function selectRecoverableAgentTaskForProject(
  tasks: AgentTask[],
  projectId: string
) {
  return (
    tasks
      .filter(
        (task) =>
          task.projectId === projectId && isRecoverableAgentTask(task)
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .at(0) ?? null
  );
}

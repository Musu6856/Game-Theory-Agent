import type {
  AgentCheckpoint,
  AgentRun,
  AgentStep,
  AgentTraceEvent,
} from "../types";

export type AgentTraceReplayStep = {
  id: string;
  title: string;
  kind: AgentStep["kind"] | "unplanned";
  status: AgentStep["status"];
  toolName?: string;
  events: AgentTraceEvent[];
  checkpoints: AgentCheckpoint[];
  latestCheckpoint?: AgentCheckpoint;
  latestMessage?: string;
  hasError: boolean;
  wasResumed: boolean;
};

export type AgentTraceReplay = {
  steps: AgentTraceReplayStep[];
  unplannedSteps: AgentTraceReplayStep[];
  unscopedEvents: AgentTraceEvent[];
  summary: {
    totalStepCount: number;
    completedStepCount: number;
    failedStepCount: number;
    runningStepCount: number;
    resumedStepCount: number;
    unscopedEventCount: number;
  };
};

export type AgentTraceReplayFilter =
  | "all"
  | "issues"
  | "recovered"
  | "tools"
  | "models"
  | "approval";

export function buildAgentTraceReplay(run: AgentRun): AgentTraceReplay {
  const eventsByStepId = groupByStepId(run.trace);
  const checkpointsByStepId = groupByStepId(run.checkpoints ?? []);
  const plannedStepIds = new Set(run.plan.map((step) => step.id));
  const steps = run.plan.map((step) =>
    createReplayStep({
      id: step.id,
      title: step.title,
      kind: step.kind,
      status: step.status,
      toolName: step.toolName,
      events: eventsByStepId.get(step.id) ?? [],
      checkpoints: checkpointsByStepId.get(step.id) ?? [],
    })
  );
  const unplannedStepIds = Array.from(
    new Set([
      ...Array.from(eventsByStepId.keys()),
      ...Array.from(checkpointsByStepId.keys()),
    ])
  ).filter((stepId) => !plannedStepIds.has(stepId));
  const unplannedSteps = unplannedStepIds.map((stepId) => {
    const events = eventsByStepId.get(stepId) ?? [];
    const checkpoints = checkpointsByStepId.get(stepId) ?? [];
    const latestCheckpoint = checkpoints.at(-1);
    return createReplayStep({
      id: stepId,
      title: latestCheckpoint?.title ?? stepId,
      kind: "unplanned",
      status: latestCheckpoint?.status ?? inferStatusFromEvents(events),
      toolName: latestCheckpoint?.toolName,
      events,
      checkpoints,
    });
  });
  const allSteps = [...steps, ...unplannedSteps];

  return {
    steps,
    unplannedSteps,
    unscopedEvents: run.trace.filter((event) => !event.stepId),
    summary: {
      totalStepCount: allSteps.length,
      completedStepCount: allSteps.filter((step) => step.status === "completed")
        .length,
      failedStepCount: allSteps.filter((step) => step.status === "failed").length,
      runningStepCount: allSteps.filter((step) => step.status === "running")
        .length,
      resumedStepCount: allSteps.filter((step) => step.wasResumed).length,
      unscopedEventCount: run.trace.filter((event) => !event.stepId).length,
    },
  };
}

export function filterAgentTraceReplaySteps(
  steps: AgentTraceReplayStep[],
  filter: AgentTraceReplayFilter
) {
  if (filter === "all") return steps;

  return steps.filter((step) => {
    switch (filter) {
      case "issues":
        return step.hasError || step.status === "failed";
      case "recovered":
        return step.wasResumed;
      case "tools":
        return step.kind === "tool" ||
          Boolean(step.toolName) ||
          step.events.some(isToolTraceEvent);
      case "models":
        return step.events.some(isModelTraceEvent);
      case "approval":
        return step.kind === "approval";
      default:
        return true;
    }
  });
}

export function filterAgentTraceEvents(
  events: AgentTraceEvent[],
  filter: AgentTraceReplayFilter
) {
  if (filter === "all") return events;

  return events.filter((event) => {
    switch (filter) {
      case "issues":
        return event.type === "error";
      case "recovered":
        return hasResumeMetadata(event.metadata);
      case "tools":
        return isToolTraceEvent(event);
      case "models":
        return isModelTraceEvent(event);
      case "approval":
        return false;
      default:
        return true;
    }
  });
}

export function buildAgentRunAuditMarkdown(run: AgentRun) {
  const replay = buildAgentTraceReplay(run);
  const lines: string[] = ["# Agent 执行记录"];

  lines.push(
    "",
    `- Run ID：\`${run.id}\``,
    `- 目标：${formatGoal(run.goal)}`,
    `- 状态：${formatRunStatus(run.status)}`,
    `- 开始时间：${formatAuditTimestamp(run.startedAt)}`,
    `- 完成时间：${run.completedAt ? formatAuditTimestamp(run.completedAt) : "未完成"}`,
    `- 步骤：${replay.summary.totalStepCount}`,
    `- 完成：${replay.summary.completedStepCount}`,
    `- 失败：${replay.summary.failedStepCount}`,
    `- 恢复：${replay.summary.resumedStepCount}`
  );

  if (run.pauseReason) {
    lines.push(`- 暂停原因：${run.pauseReason}`);
  }

  const steps = [...replay.steps, ...replay.unplannedSteps];
  if (steps.length > 0) {
    lines.push("", "## 步骤回放");
    steps.forEach((step, index) => {
      lines.push(
        "",
        `### ${index + 1}. ${step.title}`,
        `- 步骤 ID：\`${step.id}\``,
        `- 状态：${formatStepStatus(step.status)}`,
        `- 类型：${formatStepKind(step.kind)}`,
        `- 检查点：${step.checkpoints.length}`,
        `- 事件：${step.events.length}`
      );
      if (step.toolName) lines.push(`- 工具：\`${step.toolName}\``);
      if (step.wasResumed) lines.push("- 恢复：是");
      if (step.latestMessage) lines.push(`- 最近说明：${step.latestMessage}`);
      if (step.latestCheckpoint) {
        lines.push(
          `- 最近检查点：${formatStepStatus(step.latestCheckpoint.status)} / ${formatAuditTimestamp(step.latestCheckpoint.createdAt)}`
        );
      }

      if (step.events.length > 0) {
        lines.push("", "#### 事件");
        step.events.forEach((event) => {
          pushTraceEvent(lines, event);
        });
      }

      if (step.checkpoints.length > 0) {
        lines.push("", "#### 检查点");
        step.checkpoints.forEach((checkpoint) => {
          lines.push(
            `- ${formatAuditTimestamp(checkpoint.createdAt)} / ${formatStepStatus(checkpoint.status)} / \`${checkpoint.id}\``
          );
          if (checkpoint.metadata && Object.keys(checkpoint.metadata).length > 0) {
            lines.push(indentCodeBlock(JSON.stringify(checkpoint.metadata, null, 2)));
          }
        });
      }
    });
  }

  if (replay.unscopedEvents.length > 0) {
    lines.push("", "## 未归属事件");
    replay.unscopedEvents.forEach((event) => {
      pushTraceEvent(lines, event);
    });
  }

  return lines.join("\n");
}

export function getAgentRunAuditMarkdownFilename(run: AgentRun) {
  return `${sanitizeFilename(`paperforge-agent-run-${run.id}`)}.md`;
}

function createReplayStep({
  id,
  title,
  kind,
  status,
  toolName,
  events,
  checkpoints,
}: {
  id: string;
  title: string;
  kind: AgentTraceReplayStep["kind"];
  status: AgentStep["status"];
  toolName?: string;
  events: AgentTraceEvent[];
  checkpoints: AgentCheckpoint[];
}): AgentTraceReplayStep {
  const latestCheckpoint = checkpoints.at(-1);
  const latestEvent = events.at(-1);
  return {
    id,
    title,
    kind,
    status: latestCheckpoint?.status ?? status,
    toolName,
    events,
    checkpoints,
    latestCheckpoint,
    latestMessage: latestEvent?.message,
    hasError: events.some((event) => event.type === "error") ||
      checkpoints.some((checkpoint) => checkpoint.status === "failed"),
    wasResumed: checkpoints.some(
      (checkpoint) => typeof checkpoint.metadata?.resumedFromCheckpointId === "string"
    ) || events.some(
      (event) => typeof event.metadata?.resumedFromCheckpointId === "string"
    ),
  };
}

function isToolTraceEvent(event: AgentTraceEvent) {
  return event.type === "tool_call" || event.type === "tool_result";
}

function isModelTraceEvent(event: AgentTraceEvent) {
  return event.type === "model_call" || event.type === "model_result";
}

function hasResumeMetadata(metadata?: Record<string, unknown>) {
  return typeof metadata?.resumedFromCheckpointId === "string";
}

function groupByStepId<T extends { stepId?: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    if (!item.stepId) return;
    map.set(item.stepId, [...(map.get(item.stepId) ?? []), item]);
  });
  return map;
}

function inferStatusFromEvents(events: AgentTraceEvent[]): AgentStep["status"] {
  if (events.some((event) => event.type === "error")) return "failed";
  if (events.length > 0) return "completed";
  return "pending";
}

function pushTraceEvent(lines: string[], event: AgentTraceEvent) {
  lines.push(
    `- ${formatAuditTimestamp(event.createdAt)} / ${formatTraceType(event.type)}：${event.message}`
  );
  if (event.metadata && Object.keys(event.metadata).length > 0) {
    lines.push(indentCodeBlock(JSON.stringify(event.metadata, null, 2)));
  }
}

function indentCodeBlock(value: string) {
  return [
    "  ```json",
    ...value.split("\n").map((line) => `  ${line}`),
    "  ```",
  ].join("\n");
}

function formatAuditTimestamp(value: number) {
  return new Date(value).toISOString();
}

function formatGoal(goal: string) {
  if (goal === "推进到下一个审核点") return "连续推进";
  return goal;
}

function formatRunStatus(status: AgentRun["status"]) {
  switch (status) {
    case "completed":
      return "已完成";
    case "paused":
      return "已暂停";
    case "running":
      return "运行中";
    case "failed":
      return "失败";
    case "idle":
      return "待开始";
  }
}

function formatStepStatus(status: AgentStep["status"]) {
  switch (status) {
    case "pending":
      return "待执行";
    case "running":
      return "执行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "skipped":
      return "已跳过";
  }
}

function formatStepKind(kind: AgentTraceReplayStep["kind"]) {
  switch (kind) {
    case "tool":
      return "工具";
    case "approval":
      return "审核";
    case "reflection":
      return "思考";
    case "unplanned":
      return "未规划";
  }
}

function formatTraceType(type: AgentTraceEvent["type"]) {
  switch (type) {
    case "plan_created":
      return "计划";
    case "tool_call":
      return "工具调用";
    case "tool_result":
      return "工具结果";
    case "model_call":
      return "模型调用";
    case "model_result":
      return "模型结果";
    case "fallback":
      return "降级";
    case "error":
      return "错误";
  }
}

function sanitizeFilename(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "paperforge-agent-run";
}

import type {
  AgentRun,
  AgentStep,
  AgentTraceEvent,
  EvidenceSource,
  ResearchAssetChange,
  ResearchAssetKind,
  ResearchAssetVersionEvent,
  ResearchProject,
  ResearchSession,
} from "../types";
import { buildAgentTraceReplay } from "./trace-replay.ts";

export function buildProjectAuditMarkdown(project: ResearchProject) {
  const session = project.researchSession;
  const runs = getProjectAgentRuns(session);
  const versionHistory = session?.assetVersionHistory ?? [];
  const pendingPatches =
    session?.assetPatches?.filter((patch) => patch.status === "proposed") ?? [];
  const lines: string[] = ["# PaperForge 项目审计报告"];

  lines.push(
    "",
    "## 项目概览",
    "",
    `- 项目 ID：\`${project.id}\``,
    `- 创建时间：${formatAuditTimestamp(project.createdAt)}`,
    `- 研究想法：${project.rawIdea || "未填写"}`,
    `- 当前题目：${project.refinedIdea || "未形成题目"}`,
    `- 项目类型：${formatProjectType(project.projectType)}`,
    `- 当前阶段：${formatResearchPhase(session?.phase)}`,
    `- 当前方向：${session?.assetSummary.currentDirection?.title ?? "尚未选择"}`,
    `- Agent 执行记录：${runs.length} 条`,
    `- 资产审核历史：${versionHistory.length} 条`,
    `- 待审核修改建议：${pendingPatches.length} 条`,
    `- 论文章节：${project.sections.length} 节`
  );

  appendEvidencePack(lines, session);
  appendDirections(lines, session);
  appendPendingPatches(lines, session);
  appendAgentRuns(lines, runs);
  appendAssetVersionHistory(lines, versionHistory);

  return lines.join("\n");
}

export function getProjectAuditMarkdownFilename(project: ResearchProject) {
  return `${sanitizeFilename(`paperforge-project-audit-${project.id}`)}.md`;
}

function appendEvidencePack(lines: string[], session?: ResearchSession) {
  const pack = session?.evidencePack;

  lines.push("", "## 联网搜索来源");
  if (!pack) {
    lines.push("", "暂无联网搜索来源。");
    return;
  }

  lines.push(
    "",
    `- 检索查询：${pack.query}`,
    `- 生成时间：${formatAuditTimestamp(pack.createdAt)}`,
    `- 来源数量：${pack.sources.length}`,
    `- 概要：${pack.summary}`
  );

  pack.sources.forEach((source) => {
    appendEvidenceSource(lines, source);
  });
}

function appendEvidenceSource(lines: string[], source: EvidenceSource) {
  lines.push(
    "",
    `### [${source.id}] ${source.title}`,
    "",
    `- 类型：${formatEvidenceSourceType(source.sourceType)}`,
    `- URL：${source.url}`,
    `- 抓取时间：${formatAuditTimestamp(source.retrievedAt)}`
  );
  if (source.publishedAt) lines.push(`- 发布时间：${source.publishedAt}`);
  lines.push(
    `- 摘要：${source.summary}`,
    `- 相关性：${source.relevance}`
  );
}

function appendDirections(lines: string[], session?: ResearchSession) {
  lines.push("", "## 方向选择");
  if (!session || session.directions.length === 0) {
    lines.push("", "暂无方向候选。");
    return;
  }

  const adoptedId = session.assetSummary.currentDirection?.id;
  session.directions.forEach((direction, index) => {
    const markers = [
      direction.recommended ? "推荐" : "",
      direction.id === adoptedId ? "已选择" : "",
    ].filter(Boolean);
    lines.push(
      "",
      `### ${index + 1}. ${direction.title}${markers.length ? `（${markers.join("，")}）` : ""}`,
      "",
      `- 方向 ID：\`${direction.id}\``,
      `- 摘要：${direction.summary}`,
      `- 模型：${direction.model}`,
      `- 贡献：${direction.contribution}`
    );
    if (direction.evidenceSourceIds?.length) {
      lines.push(`- 使用来源：${direction.evidenceSourceIds.join(", ")}`);
    }
    if (direction.evidenceNote) {
      lines.push(`- 来源说明：${direction.evidenceNote}`);
    }
  });
}

function appendPendingPatches(lines: string[], session?: ResearchSession) {
  const patches =
    session?.assetPatches?.filter((patch) => patch.status === "proposed") ?? [];

  lines.push("", "## 当前待审核修改建议");
  if (patches.length === 0) {
    lines.push("", "暂无待审核修改建议。");
    return;
  }

  patches.forEach((patch, index) => {
    lines.push(
      "",
      `### ${index + 1}. ${patch.summary}`,
      "",
      `- Patch ID：\`${patch.id}\``,
      `- 资产：${formatAssetKind(patch.kind)}`,
      `- 创建时间：${formatAuditTimestamp(patch.createdAt)}`,
      `- 修改路径：${patch.changes.map((change) => change.path).join(", ")}`
    );
  });
}

function appendAgentRuns(lines: string[], runs: AgentRun[]) {
  lines.push("", "## Agent 执行记录");
  if (runs.length === 0) {
    lines.push("", "暂无 Agent 执行记录。");
    return;
  }

  runs.forEach((run, index) => {
    const replay = buildAgentTraceReplay(run);
    const steps = [...replay.steps, ...replay.unplannedSteps];
    lines.push(
      "",
      `### ${index + 1}. ${formatAgentRunGoal(run.goal)}`,
      "",
      `- Run ID：\`${run.id}\``,
      `- 状态：${formatRunStatus(run.status)}`,
      `- 开始时间：${formatAuditTimestamp(run.startedAt)}`,
      `- 完成时间：${run.completedAt ? formatAuditTimestamp(run.completedAt) : "未完成"}`,
      `- 步骤：${replay.summary.totalStepCount}`,
      `- 已完成：${replay.summary.completedStepCount}`,
      `- 失败：${replay.summary.failedStepCount}`,
      `- 恢复：${replay.summary.resumedStepCount}`
    );
    if (run.pauseReason) lines.push(`- 暂停原因：${run.pauseReason}`);

    if (steps.length > 0) {
      lines.push("", "#### 步骤回放");
      steps.forEach((step, stepIndex) => {
        lines.push(
          "",
          `##### ${stepIndex + 1}. ${step.title}`,
          "",
          `- 步骤 ID：\`${step.id}\``,
          `- 状态：${formatStepStatus(step.status)}`,
          `- 类型：${formatStepKind(step.kind)}`,
          `- 检查点：${step.checkpoints.length}`,
          `- 事件：${step.events.length}`
        );
        if (step.toolName) lines.push(`- 工具：\`${step.toolName}\``);
        if (step.wasResumed) lines.push("- 是否恢复：是");
        if (step.latestMessage) lines.push(`- 最近说明：${step.latestMessage}`);
        if (step.latestCheckpoint) {
          lines.push(
            `- 最近检查点：${formatStepStatus(step.latestCheckpoint.status)} / ${formatAuditTimestamp(step.latestCheckpoint.createdAt)}`
          );
        }
        appendTraceEvents(lines, step.events);
      });
    }

    if (replay.unscopedEvents.length > 0) {
      lines.push("", "#### 未归属事件");
      appendTraceEvents(lines, replay.unscopedEvents);
    }
  });
}

function appendTraceEvents(lines: string[], events: AgentTraceEvent[]) {
  if (events.length === 0) return;

  lines.push("", "###### 事件");
  events.forEach((event) => {
    lines.push(
      `- ${formatAuditTimestamp(event.createdAt)} / ${formatTraceType(event.type)}：${event.message}`
    );
    if (event.metadata && Object.keys(event.metadata).length > 0) {
      lines.push(indentCodeBlock(JSON.stringify(event.metadata, null, 2)));
    }
  });
}

function appendAssetVersionHistory(
  lines: string[],
  history: ResearchAssetVersionEvent[]
) {
  lines.push("", "## 资产审核历史");
  if (history.length === 0) {
    lines.push("", "暂无资产审核历史。");
    return;
  }

  history.forEach((event, index) => {
    lines.push(
      "",
      `### ${index + 1}. ${event.summary}`,
      "",
      `- 事件 ID：\`${event.id}\``,
      `- 资产：${formatAssetKind(event.assetKind)}`,
      `- 动作：${formatVersionAction(event.action)}`,
      `- Patch ID：\`${event.patchId}\``,
      `- 时间：${formatAuditTimestamp(event.createdAt)}`,
      `- 修改数量：${event.changeCount}`,
      `- 修改路径：${event.changedPaths.join(", ") || "无"}`
    );
    if (event.approvedBy) lines.push(`- 审核人：${event.approvedBy}`);
    if (event.rejectionReason) lines.push(`- 拒绝原因：${event.rejectionReason}`);
    if (event.nextRecommendation) {
      lines.push(`- 后续建议：${event.nextRecommendation}`);
    }
    appendAssetChanges(lines, event.changes);
  });
}

function appendAssetChanges(lines: string[], changes: ResearchAssetChange[]) {
  if (changes.length === 0) return;

  lines.push("", "#### 修改明细");
  changes.forEach((change) => {
    lines.push(
      "",
      `- ${formatChangeKind(change.kind)}：\`${change.path}\``
    );
    if (change.note) lines.push(`  - 说明：${change.note}`);
    if (change.previousValue !== undefined) {
      lines.push(`  - 原值：${formatAuditValue(change.previousValue)}`);
    }
    if (change.value !== undefined) {
      lines.push(`  - 新值：${formatAuditValue(change.value)}`);
    }
  });
}

function getProjectAgentRuns(session?: ResearchSession) {
  if (!session) return [];

  const runs = [...(session.agentRunHistory ?? [])];
  if (session.agentRun && !runs.some((run) => run.id === session.agentRun?.id)) {
    runs.push(session.agentRun);
  }
  return runs;
}

function formatAuditTimestamp(value: number) {
  return new Date(value).toISOString();
}

function formatResearchPhase(phase?: ResearchSession["phase"]) {
  switch (phase) {
    case "direction":
      return "方向发现";
    case "model":
      return "模型设定";
    case "equilibrium":
      return "符号均衡";
    case "analysis":
      return "性质分析";
    case "paper":
      return "论文草稿";
    default:
      return "尚未开始";
  }
}

function formatProjectType(type: ResearchProject["projectType"]) {
  switch (type) {
    case "exploration":
      return "探索项目";
    case "formal":
      return "正式研究";
    case "legacy":
      return "旧版项目";
    default:
      return "未标记";
  }
}

function formatEvidenceSourceType(type: EvidenceSource["sourceType"]) {
  switch (type) {
    case "paper":
      return "论文";
    case "web":
      return "网页";
    case "policy":
      return "政策";
    case "industry":
      return "行业资料";
  }
}

function formatAssetKind(kind: ResearchAssetKind) {
  switch (kind) {
    case "model":
      return "模型";
    case "equilibrium":
      return "均衡";
    case "properties":
      return "性质分析";
    case "paper":
      return "论文草稿";
  }
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

function formatStepKind(kind: AgentStep["kind"] | "unplanned") {
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

function formatAgentRunGoal(goal: string) {
  if (
    goal === "推进到下一个审核点" ||
    goal === "鎺ㄨ繘鍒颁笅涓€涓鏍哥偣"
  ) {
    return "连续推进";
  }
  return goal;
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

function formatVersionAction(action: ResearchAssetVersionEvent["action"]) {
  switch (action) {
    case "applied_patch":
      return "已应用";
    case "rejected_patch":
      return "已拒绝";
  }
}

function formatChangeKind(kind: ResearchAssetChange["kind"]) {
  switch (kind) {
    case "replace":
      return "替换";
    case "append":
      return "追加";
    case "remove":
      return "移除";
  }
}

function formatAuditValue(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text) return "空";
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

function indentCodeBlock(value: string) {
  return [
    "  ```json",
    ...value.split("\n").map((line) => `  ${line}`),
    "  ```",
  ].join("\n");
}

function sanitizeFilename(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "paperforge-project-audit";
}

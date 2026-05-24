import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentRunAuditMarkdown,
  buildAgentTraceReplay,
  filterAgentTraceEvents,
  filterAgentTraceReplaySteps,
  getAgentRunAuditMarkdownFilename,
} from "./trace-replay.ts";

test("trace replay groups checkpoints and events by planned step", () => {
  const replay = buildAgentTraceReplay({
    id: "agent-replay",
    goal: "测试回放",
    status: "paused",
    startedAt: 1710000000000,
    plan: [
      {
        id: "prepare-equilibrium",
        kind: "reflection",
        title: "准备均衡目标",
        status: "completed",
      },
      {
        id: "draft-equilibrium",
        kind: "tool",
        toolName: "research.solveEquilibrium",
        title: "生成符号均衡",
        status: "failed",
      },
    ],
    checkpoints: [
      {
        id: "checkpoint-1",
        runId: "agent-replay",
        stepId: "prepare-equilibrium",
        title: "准备均衡目标",
        status: "running",
        createdAt: 1710000000100,
      },
      {
        id: "checkpoint-2",
        runId: "agent-replay",
        stepId: "prepare-equilibrium",
        title: "准备均衡目标",
        status: "completed",
        createdAt: 1710000000200,
      },
      {
        id: "checkpoint-3",
        runId: "agent-replay",
        stepId: "draft-equilibrium",
        title: "生成符号均衡",
        status: "failed",
        toolName: "research.solveEquilibrium",
        createdAt: 1710000000300,
      },
    ],
    trace: [
      {
        id: "trace-1",
        runId: "agent-replay",
        type: "plan_created",
        message: "Created plan.",
        createdAt: 1710000000000,
      },
      {
        id: "trace-2",
        runId: "agent-replay",
        stepId: "prepare-equilibrium",
        type: "model_result",
        message: "Prepared assets.",
        createdAt: 1710000000150,
        metadata: { conditionCount: 2 },
      },
      {
        id: "trace-3",
        runId: "agent-replay",
        stepId: "draft-equilibrium",
        type: "error",
        message: "Provider failed.",
        createdAt: 1710000000350,
        metadata: { errorCode: "provider_error" },
      },
    ],
  });

  assert.equal(replay.steps.length, 2);
  assert.deepEqual(
    replay.steps.map((step) => ({
      id: step.id,
      title: step.title,
      status: step.status,
      eventCount: step.events.length,
      checkpointCount: step.checkpoints.length,
      latestMessage: step.latestMessage,
      hasError: step.hasError,
    })),
    [
      {
        id: "prepare-equilibrium",
        title: "准备均衡目标",
        status: "completed",
        eventCount: 1,
        checkpointCount: 2,
        latestMessage: "Prepared assets.",
        hasError: false,
      },
      {
        id: "draft-equilibrium",
        title: "生成符号均衡",
        status: "failed",
        eventCount: 1,
        checkpointCount: 1,
        latestMessage: "Provider failed.",
        hasError: true,
      },
    ]
  );
  assert.equal(replay.unscopedEvents.length, 1);
  assert.equal(replay.summary.failedStepCount, 1);
  assert.equal(replay.summary.completedStepCount, 1);
});

test("trace replay marks recovered steps and keeps unplanned step events", () => {
  const replay = buildAgentTraceReplay({
    id: "agent-replay-resume",
    goal: "测试恢复回放",
    status: "running",
    startedAt: 1710000000000,
    plan: [
      {
        id: "draft-properties",
        kind: "tool",
        title: "生成性质分析",
        status: "running",
      },
    ],
    checkpoints: [
      {
        id: "checkpoint-1",
        runId: "agent-replay-resume",
        stepId: "draft-properties",
        title: "生成性质分析",
        status: "running",
        createdAt: 1710000000100,
        metadata: {
          resumedFromCheckpointId: "checkpoint-old",
        },
      },
    ],
    trace: [
      {
        id: "trace-1",
        runId: "agent-replay-resume",
        stepId: "draft-properties",
        type: "fallback",
        message: "从检查点恢复 Agent 执行。",
        createdAt: 1710000000100,
      },
      {
        id: "trace-2",
        runId: "agent-replay-resume",
        stepId: "unexpected-step",
        type: "tool_result",
        message: "Legacy event.",
        createdAt: 1710000000200,
      },
    ],
  });

  assert.equal(replay.steps[0].wasResumed, true);
  assert.equal(replay.steps[0].latestCheckpoint?.metadata?.resumedFromCheckpointId, "checkpoint-old");
  assert.equal(replay.unplannedSteps.length, 1);
  assert.equal(replay.unplannedSteps[0].id, "unexpected-step");
  assert.equal(replay.unplannedSteps[0].latestMessage, "Legacy event.");
});

test("trace replay filters steps and unscoped events for audit views", () => {
  const replay = buildAgentTraceReplay({
    id: "agent-filter",
    goal: "filter audit",
    status: "failed",
    startedAt: 1710000000000,
    plan: [
      {
        id: "tool-step",
        kind: "tool",
        toolName: "research.solveEquilibrium",
        title: "Run tool",
        status: "completed",
      },
      {
        id: "model-step",
        kind: "reflection",
        title: "Read model",
        status: "completed",
      },
      {
        id: "approval-step",
        kind: "approval",
        title: "Wait approval",
        status: "pending",
      },
      {
        id: "failed-step",
        kind: "tool",
        title: "Failed tool",
        status: "failed",
      },
    ],
    checkpoints: [
      {
        id: "checkpoint-1",
        runId: "agent-filter",
        stepId: "model-step",
        title: "Read model",
        status: "completed",
        createdAt: 1710000000100,
        metadata: { resumedFromCheckpointId: "checkpoint-old" },
      },
    ],
    trace: [
      {
        id: "trace-1",
        runId: "agent-filter",
        stepId: "tool-step",
        type: "tool_result",
        message: "Tool returned",
        createdAt: 1710000000200,
      },
      {
        id: "trace-2",
        runId: "agent-filter",
        stepId: "model-step",
        type: "model_result",
        message: "Model returned",
        createdAt: 1710000000300,
      },
      {
        id: "trace-3",
        runId: "agent-filter",
        stepId: "failed-step",
        type: "error",
        message: "Tool failed",
        createdAt: 1710000000400,
      },
      {
        id: "trace-4",
        runId: "agent-filter",
        type: "error",
        message: "Unscoped failure",
        createdAt: 1710000000500,
      },
      {
        id: "trace-5",
        runId: "agent-filter",
        type: "fallback",
        message: "Unscoped resume",
        createdAt: 1710000000600,
        metadata: { resumedFromCheckpointId: "checkpoint-old" },
      },
    ],
  });
  const steps = [...replay.steps, ...replay.unplannedSteps];

  assert.deepEqual(
    filterAgentTraceReplaySteps(steps, "issues").map((step) => step.id),
    ["failed-step"]
  );
  assert.deepEqual(
    filterAgentTraceReplaySteps(steps, "recovered").map((step) => step.id),
    ["model-step"]
  );
  assert.deepEqual(
    filterAgentTraceReplaySteps(steps, "tools").map((step) => step.id),
    ["tool-step", "failed-step"]
  );
  assert.deepEqual(
    filterAgentTraceReplaySteps(steps, "models").map((step) => step.id),
    ["model-step"]
  );
  assert.deepEqual(
    filterAgentTraceReplaySteps(steps, "approval").map((step) => step.id),
    ["approval-step"]
  );
  assert.deepEqual(
    filterAgentTraceEvents(replay.unscopedEvents, "issues").map(
      (event) => event.id
    ),
    ["trace-4"]
  );
  assert.deepEqual(
    filterAgentTraceEvents(replay.unscopedEvents, "recovered").map(
      (event) => event.id
    ),
    ["trace-5"]
  );
});

test("buildAgentRunAuditMarkdown exports a readable execution report", () => {
  const markdown = buildAgentRunAuditMarkdown({
    id: "agent-audit/unsafe:name",
    goal: "推进到下一个审核点",
    status: "paused",
    startedAt: 1710000000000,
    completedAt: 1710000001000,
    pauseReason: "Waiting for approval",
    plan: [
      {
        id: "draft-paper",
        kind: "tool",
        toolName: "research.draftPaper",
        title: "Draft paper",
        status: "completed",
      },
    ],
    checkpoints: [
      {
        id: "checkpoint-1",
        runId: "agent-audit/unsafe:name",
        stepId: "draft-paper",
        title: "Draft paper",
        status: "completed",
        toolName: "research.draftPaper",
        createdAt: 1710000000500,
        metadata: { previousStatus: "running" },
      },
    ],
    trace: [
      {
        id: "trace-1",
        runId: "agent-audit/unsafe:name",
        stepId: "draft-paper",
        type: "tool_result",
        message: "Created a patch.",
        createdAt: 1710000000600,
        metadata: { patchId: "patch-1" },
      },
    ],
  });

  assert.match(markdown, /^# Agent 执行记录/);
  assert.match(markdown, /目标：连续推进/);
  assert.match(markdown, /## 步骤回放/);
  assert.match(markdown, /Draft paper/);
  assert.match(markdown, /Created a patch\./);
  assert.match(markdown, /"patchId": "patch-1"/);
  assert.equal(
    getAgentRunAuditMarkdownFilename({
      id: "agent-audit/unsafe:name",
      goal: "audit",
      status: "completed",
      startedAt: 1710000000000,
      plan: [],
      trace: [],
    }),
    "paperforge-agent-run-agent-audit-unsafe-name.md"
  );
});

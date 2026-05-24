import assert from "node:assert/strict";
import test from "node:test";

import { createAgentRun, updateStepStatus } from "./state.ts";
import {
  createResumeRun,
  getLatestAgentRunById,
  shouldSkipCompletedStep,
} from "./resume.ts";

test("createResumeRun reuses a failed run and reopens the failed step", () => {
  const original = updateStepStatus(
    updateStepStatus(
      createAgentRun({
        id: "agent-resume-target",
        goal: "测试续跑",
        now: 1710000000000,
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
            status: "running",
          },
        ],
      }),
      "draft-equilibrium",
      "running",
      1710000000100
    ),
    "draft-equilibrium",
    "failed",
    1710000000200
  );

  const resumed = createResumeRun({
    run: original,
    checkpointId: "checkpoint-2",
    now: 1710000000300,
  });

  assert.equal(resumed.id, original.id);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.currentStepId, "draft-equilibrium");
  assert.equal(
    resumed.plan.find((step) => step.id === "prepare-equilibrium")?.status,
    "completed"
  );
  assert.equal(
    resumed.plan.find((step) => step.id === "draft-equilibrium")?.status,
    "running"
  );
  assert.equal(resumed.trace.at(-1)?.type, "fallback");
  assert.match(resumed.trace.at(-1)?.message ?? "", /恢复/);
  assert.equal(resumed.checkpoints?.at(-1)?.stepId, "draft-equilibrium");
  assert.equal(resumed.checkpoints?.at(-1)?.status, "running");
  assert.equal(resumed.checkpoints?.at(-1)?.metadata?.resumedFromCheckpointId, "checkpoint-2");
});

test("getLatestAgentRunById reads history before legacy current run", () => {
  const older = createAgentRun({
    id: "agent-older",
    goal: "older",
    now: 1710000000000,
    plan: [],
  });
  const target = createAgentRun({
    id: "agent-target",
    goal: "target",
    now: 1710000000100,
    plan: [],
  });

  const project = {
    researchSession: {
      agentRun: older,
      agentRunHistory: [older, target],
    },
  };

  assert.equal(getLatestAgentRunById(project, "agent-target")?.id, "agent-target");
});

test("shouldSkipCompletedStep skips only completed steps before the resume point", () => {
  const run = createResumeRun({
    run: {
      ...createAgentRun({
        id: "agent-skip",
        goal: "skip test",
        now: 1710000000000,
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
            title: "生成符号均衡",
            status: "failed",
          },
          {
            id: "review-equilibrium",
            kind: "reflection",
            title: "审核均衡",
            status: "pending",
          },
        ],
      }),
      checkpoints: [
        {
          id: "checkpoint-1",
          runId: "agent-skip",
          stepId: "prepare-equilibrium",
          title: "准备均衡目标",
          status: "completed",
          createdAt: 1710000000100,
        },
        {
          id: "checkpoint-2",
          runId: "agent-skip",
          stepId: "draft-equilibrium",
          title: "生成符号均衡",
          status: "failed",
          createdAt: 1710000000200,
        },
      ],
    },
    checkpointId: "checkpoint-2",
    now: 1710000000300,
  });

  assert.equal(shouldSkipCompletedStep(run, "prepare-equilibrium"), true);
  assert.equal(shouldSkipCompletedStep(run, "draft-equilibrium"), false);
  assert.equal(shouldSkipCompletedStep(run, "review-equilibrium"), false);
});

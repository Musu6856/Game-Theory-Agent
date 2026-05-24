import assert from "node:assert/strict";
import test from "node:test";

import {
  completeAgentRun,
  createAgentRun,
  updateStepStatus,
} from "./state.ts";

test("agent run step status updates create resumable checkpoints", () => {
  const run = createAgentRun({
    id: "agent-checkpoint",
    goal: "测试步骤检查点",
    now: 1710000000000,
    plan: [
      {
        id: "draft-equilibrium",
        kind: "tool",
        toolName: "research.solveEquilibrium",
        title: "生成符号均衡",
        status: "pending",
      },
    ],
  });

  const running = updateStepStatus(
    run,
    "draft-equilibrium",
    "running",
    1710000000100
  );
  const completed = updateStepStatus(
    running,
    "draft-equilibrium",
    "completed",
    1710000000200
  );

  assert.equal(running.currentStepId, "draft-equilibrium");
  assert.equal(completed.currentStepId, undefined);
  assert.deepEqual(
    completed.checkpoints?.map((checkpoint) => ({
      id: checkpoint.id,
      stepId: checkpoint.stepId,
      title: checkpoint.title,
      status: checkpoint.status,
      toolName: checkpoint.toolName,
      createdAt: checkpoint.createdAt,
      previousStatus: checkpoint.metadata?.previousStatus,
    })),
    [
      {
        id: "checkpoint-1",
        stepId: "draft-equilibrium",
        title: "生成符号均衡",
        status: "running",
        toolName: "research.solveEquilibrium",
        createdAt: 1710000000100,
        previousStatus: "pending",
      },
      {
        id: "checkpoint-2",
        stepId: "draft-equilibrium",
        title: "生成符号均衡",
        status: "completed",
        toolName: "research.solveEquilibrium",
        createdAt: 1710000000200,
        previousStatus: "running",
      },
    ]
  );
});

test("completing a run checkpoints any unfinished current step", () => {
  const run = updateStepStatus(
    createAgentRun({
      id: "agent-complete",
      goal: "测试完成检查点",
      now: 1710000000000,
      plan: [
        {
          id: "discover-directions",
          kind: "reflection",
          title: "生成方向建议",
          status: "pending",
        },
      ],
    }),
    "discover-directions",
    "running",
    1710000000100
  );

  const completed = completeAgentRun(run, 1710000000200);

  assert.equal(completed.status, "completed");
  assert.equal(completed.currentStepId, undefined);
  assert.equal(completed.checkpoints?.at(-1)?.stepId, "discover-directions");
  assert.equal(completed.checkpoints?.at(-1)?.status, "completed");
  assert.equal(completed.checkpoints?.at(-1)?.createdAt, 1710000000200);
});

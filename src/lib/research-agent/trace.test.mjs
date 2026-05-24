import assert from "node:assert/strict";
import test from "node:test";

import { createExplorationProject } from "../research-session.ts";
import { planSafeContinuation } from "./controller.ts";
import {
  appendAgentRunToProject,
  appendSafeContinuationTrace,
} from "./trace.ts";
import { createAgentRun } from "./state.ts";

test("agent run history keeps the latest run without losing previous runs", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const firstRun = createAgentRun({
    id: "agent-first",
    goal: "first",
    now: 1710000000000,
    plan: [],
  });
  const secondRun = createAgentRun({
    id: "agent-second",
    goal: "second",
    now: 1710000001000,
    plan: [],
  });

  const withFirst = appendAgentRunToProject(project, firstRun);
  const withSecond = appendAgentRunToProject(withFirst, secondRun);

  assert.equal(withSecond.researchSession?.agentRun?.id, "agent-second");
  assert.deepEqual(
    withSecond.researchSession?.agentRunHistory?.map((run) => run.id),
    ["agent-first", "agent-second"]
  );

  const deduped = appendAgentRunToProject(withSecond, secondRun);

  assert.deepEqual(
    deduped.researchSession?.agentRunHistory?.map((run) => run.id),
    ["agent-first", "agent-second"]
  );
});

test("safe continuation trace records planned steps, executed steps, and stop reason", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const plan = planSafeContinuation(project);
  const traced = appendSafeContinuationTrace(project, {
    plan,
    executedSteps: [],
    finalPlan: plan,
    now: 1710000002000,
  });

  const run = traced.researchSession?.agentRun;

  assert.equal(run?.id, "agent-controller-1710000002000");
  assert.equal(run?.status, "paused");
  assert.equal(run?.requiresApproval, true);
  assert.deepEqual(
    run?.checkpoints?.map((checkpoint) => ({
      stepId: checkpoint.stepId,
      status: checkpoint.status,
      title: checkpoint.title,
    })),
    [
      {
        stepId: "safe-continuation",
        status: "running",
        title: "需要先选择方向",
      },
      {
        stepId: "safe-continuation",
        status: "skipped",
        title: "需要先选择方向",
      },
    ]
  );
  assert.equal(run?.pauseReason, "请先在候选方向中采用一个方向，再继续自动推进。");
  assert.deepEqual(
    run?.trace.find((event) => event.type === "plan_created")?.metadata,
    {
      plannedSteps: [],
      targetTab: "directions",
      initialStatus: "blocked",
      initialStopReason: "manual_choice_required",
    }
  );
  assert.deepEqual(
    run?.trace.at(-1)?.metadata,
    {
      executedSteps: [],
      finalStatus: "blocked",
      finalStopReason: "manual_choice_required",
      blockerKind: "manual_choice",
      targetTab: "directions",
    }
  );
});

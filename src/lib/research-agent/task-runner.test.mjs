import assert from "node:assert/strict";
import test from "node:test";

import {
  claimLocalAgentTask,
  clearLocalAgentTaskStore,
  createLocalAgentTask,
  getLocalAgentTask,
} from "./task-store.ts";
import { runAgentTask } from "./task-runner.ts";

test("runAgentTask claims, executes, saves, and completes a persisted task", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-1",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });
  const savedProjects = [];

  const completed = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    runtimeModelSource: {
      source: "own",
      provider: "openai-compatible",
      apiKey: "sk-test",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    },
    now: 1710000001000,
    leaseMs: 60_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
    }),
    saveProject: async ({ project }) => {
      savedProjects.push(project);
      return project;
    },
    executeAction: async ({ task, project, runtimeModelSource }) => {
      assert.equal(runtimeModelSource?.source, "own");
      assert.equal(runtimeModelSource?.apiKey, "sk-test");

      return {
        project: {
          ...project,
          researchSession: {
            phase: "equilibrium",
            directions: [],
            messages: [],
            assetSummary: {
              confirmedAssumptions: [],
              utilityFunctions: [],
              equilibriumStatus: "solved",
              nextActions: [],
            },
            agentRun: {
              id: "agent-run-1",
              action: task.action,
              goal: "solve",
              status: "completed",
              plan: [
                {
                  id: "prepare-equilibrium",
                  kind: "reflection",
                  title: "Prepare equilibrium target",
                  status: "completed",
                },
                {
                  id: "review-equilibrium",
                  kind: "reflection",
                  title: "Review equilibrium derivation quality",
                  status: "completed",
                },
              ],
              checkpoints: [
                {
                  id: "checkpoint-1",
                  runId: "agent-run-1",
                  stepId: "prepare-equilibrium",
                  title: "Prepare equilibrium target",
                  status: "completed",
                  createdAt: 1710000000500,
                },
                {
                  id: "checkpoint-2",
                  runId: "agent-run-1",
                  stepId: "review-equilibrium",
                  title: "Review equilibrium derivation quality",
                  status: "completed",
                  createdAt: 1710000000900,
                  metadata: {
                    artifactIds: ["artifact-solver-attempt"],
                  },
                },
              ],
              trace: [],
              startedAt: 1710000000000,
              completedAt: 1710000001000,
            },
            assetPatches: [
              {
                id: "patch-equilibrium-1",
                kind: "equilibrium",
                summary: "candidate",
                changes: [],
                status: "proposed",
                createdAt: 1710000001000,
              },
            ],
            mathArtifacts: [
              {
                id: "artifact-solver-attempt",
                runId: "agent-run-1",
                stepId: "review-equilibrium",
                patchId: "patch-equilibrium-1",
                kind: "solver_attempt",
                title: "SymPy solver attempt",
                status: "passed",
                source: "sympy",
                createdAt: 1710000000900,
              },
            ],
          },
        },
      };
    },
  });

  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.result, {
    projectId: "11111111-1111-4111-8111-111111111111",
    runId: "agent-run-1",
    patchIds: ["patch-equilibrium-1"],
    mathArtifactIds: ["artifact-solver-attempt"],
  });
  assert.deepEqual(
    completed.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      stepId: checkpoint.stepId,
      status: checkpoint.status,
      runId: checkpoint.metadata?.runId,
      artifactIds: checkpoint.metadata?.artifactIds,
    })),
    [
      {
        id: "checkpoint-1",
        stepId: "prepare-equilibrium",
        status: "completed",
        runId: "agent-run-1",
        artifactIds: undefined,
      },
      {
        id: "checkpoint-2",
        stepId: "review-equilibrium",
        status: "completed",
        runId: "agent-run-1",
        artifactIds: ["artifact-solver-attempt"],
      },
    ]
  );
  assert.equal(savedProjects.length, 1);
  assert.equal(getLocalAgentTask("user-1", task.id)?.status, "completed");
});

test("runAgentTask records failure when execution throws", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-2",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "analyze_properties",
    input: {
      rawIdea: "test idea",
      action: "analyze_properties",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });

  const failed = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    now: 1710000001000,
    leaseMs: 60_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
    }),
    saveProject: async ({ project }) => project,
    executeAction: async () => {
      throw new Error("provider timeout");
    },
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "provider timeout");
  assert.equal(getLocalAgentTask("user-1", task.id)?.status, "failed");
});

test("runAgentTask retries transient project save failures", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-retry-save",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });
  let saveAttempts = 0;

  const completed = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    now: 1710000001000,
    leaseMs: 60_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
    }),
    saveProject: async ({ project }) => {
      saveAttempts += 1;
      if (saveAttempts === 1) {
        throw Object.assign(new Error("Failed query: update projects ..."), {
          cause: Object.assign(
            new Error("Error connecting to database: TypeError: fetch failed"),
            {
              sourceError: Object.assign(new Error("fetch failed"), {
                cause: Object.assign(new Error("socket disconnected"), {
                  code: "ECONNRESET",
                }),
              }),
            }
          ),
        });
      }
      return project;
    },
    executeAction: async ({ project }) => ({
      project: {
        ...project,
        refinedIdea: "saved after retry",
      },
    }),
  });

  assert.equal(completed.status, "completed");
  assert.equal(saveAttempts, 2);
  assert.equal(getLocalAgentTask("user-1", task.id)?.status, "completed");
});

test("runAgentTask stores concise project save failures", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-concise-save-error",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });

  const failed = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    now: 1710000001000,
    leaseMs: 60_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
    }),
    saveProject: async () => {
      throw Object.assign(
        new Error("Failed query: update projects ...\nparams: secret-value"),
        {
          cause: new Error("invalid input syntax for type json"),
        }
      );
    },
    executeAction: async ({ project }) => ({ project }),
  });

  assert.equal(failed.status, "failed");
  assert.match(failed.error, /Project save failed/);
  assert.match(failed.error, /invalid input syntax for type json/);
  assert.equal(failed.error.includes("params:"), false);
  assert.equal(failed.error.includes("secret-value"), false);
});

test("runAgentTask records agent checkpoints during execution before later failure", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-agent-checkpoint",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });
  const savedProjects = [];

  const failed = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    now: 1710000001000,
    leaseMs: 60_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
    }),
    saveProject: async ({ project }) => {
      savedProjects.push(project);
      return project;
    },
    executeAction: async ({ onAgentCheckpoint }) => {
      const run = {
        id: "agent-run-progress",
        action: "solve_equilibrium",
        goal: "solve",
        status: "running",
        plan: [
          {
            id: "draft-equilibrium",
            kind: "tool",
            title: "Draft symbolic equilibrium",
            status: "running",
            toolName: "research.solveEquilibrium",
          },
        ],
        checkpoints: [
          {
            id: "checkpoint-progress-1",
            runId: "agent-run-progress",
            stepId: "draft-equilibrium",
            title: "Draft symbolic equilibrium",
            status: "running",
            toolName: "research.solveEquilibrium",
            createdAt: 1710000000500,
            metadata: {
              runtimeModelSource: {
                apiKey: "sk-progress-secret",
              },
            },
          },
        ],
        trace: [],
        startedAt: 1710000000000,
      };

      await onAgentCheckpoint(run.checkpoints[0], run);
      throw new Error("provider failed after checkpoint");
    },
  });

  const stored = getLocalAgentTask("user-1", task.id);
  assert.equal(failed.status, "failed");
  assert.equal(stored?.checkpoints.length, 1);
  assert.deepEqual(
    stored?.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      stepId: checkpoint.stepId,
      status: checkpoint.status,
      runId: checkpoint.metadata?.runId,
      runtimeModelSource: checkpoint.metadata?.runtimeModelSource,
    })),
    [
      {
        id: "checkpoint-progress-1",
        stepId: "draft-equilibrium",
        status: "running",
        runId: "agent-run-progress",
        runtimeModelSource: undefined,
      },
    ]
  );
  assert.equal(savedProjects.length, 1);
  assert.equal(
    savedProjects[0].researchSession?.agentRun?.checkpoints?.[0]?.id,
    "checkpoint-progress-1"
  );
});

test("runAgentTask result only reports patches and math artifacts produced by the current run", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-scoped-result",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });

  const completed = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    now: 1710000001000,
    leaseMs: 60_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
      researchSession: {
        phase: "equilibrium",
        directions: [],
        messages: [],
        assetSummary: {
          confirmedAssumptions: [],
          utilityFunctions: [],
          equilibriumStatus: "not_started",
          nextActions: [],
        },
        assetPatches: [
          {
            id: "patch-old",
            kind: "model",
            summary: "old model",
            changes: [],
            status: "applied",
            createdAt: 1700000000000,
          },
        ],
        mathArtifacts: [
          {
            id: "artifact-old",
            runId: "agent-run-old",
            stepId: "review-equilibrium",
            patchId: "patch-old",
            kind: "solver_attempt",
            title: "Old solver attempt",
            status: "passed",
            source: "sympy",
            createdAt: 1700000000000,
          },
        ],
      },
    }),
    saveProject: async ({ project }) => project,
    executeAction: async ({ project }) => ({
      project: {
        ...project,
        researchSession: {
          ...project.researchSession,
          agentRun: {
            id: "agent-run-current",
            action: "solve_equilibrium",
            goal: "solve",
            status: "paused",
            plan: [],
            checkpoints: [
              {
                id: "checkpoint-current",
                runId: "agent-run-current",
                stepId: "propose-equilibrium-patch",
                title: "Propose equilibrium patch",
                status: "completed",
                createdAt: 1710000000900,
                metadata: {
                  patchId: "patch-current-checkpoint",
                },
              },
            ],
            trace: [],
            startedAt: 1710000000000,
            completedAt: 1710000001000,
          },
          assetPatches: [
            ...(project.researchSession?.assetPatches ?? []),
            {
              id: "patch-current-checkpoint",
              kind: "equilibrium",
              summary: "current checkpoint patch",
              changes: [],
              status: "proposed",
              createdAt: 1710000001000,
            },
            {
              id: "patch-current-artifact",
              kind: "equilibrium",
              summary: "current artifact patch",
              changes: [],
              status: "proposed",
              createdAt: 1710000001000,
            },
            {
              id: "patch-unrelated",
              kind: "properties",
              summary: "unrelated existing patch",
              changes: [],
              status: "proposed",
              createdAt: 1710000001000,
            },
          ],
          mathArtifacts: [
            ...(project.researchSession?.mathArtifacts ?? []),
            {
              id: "artifact-current",
              runId: "agent-run-current",
              stepId: "review-equilibrium",
              patchId: "patch-current-artifact",
              kind: "solver_attempt",
              title: "Current solver attempt",
              status: "passed",
              source: "sympy",
              createdAt: 1710000000900,
            },
          ],
        },
      },
    }),
  });

  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.result, {
    projectId: "11111111-1111-4111-8111-111111111111",
    runId: "agent-run-current",
    patchIds: ["patch-current-checkpoint", "patch-current-artifact"],
    mathArtifactIds: ["artifact-current"],
  });
});

test("runAgentTask records math artifact checkpoints during execution", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-progress-artifact",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });
  let checkpointDuringExecution;

  const completed = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    now: 1710000001000,
    leaseMs: 60_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
    }),
    saveProject: async ({ project }) => project,
    executeAction: async ({ project, onMathArtifact }) => {
      await onMathArtifact({
        id: "artifact-progress-solver-attempt",
        runId: "agent-run-progress",
        stepId: "review-equilibrium",
        kind: "solver_attempt",
        title: "SymPy solver attempt",
        status: "passed",
        source: "sympy",
        input: {
          residuals: ["2*tau_A-alpha_B"],
          runtimeModelSource: {
            apiKey: "sk-progress-secret",
          },
        },
        output: {
          solutions: [{ tau_A: "alpha_B/2" }],
          solverApiKey: "sk-solver-secret",
        },
        createdAt: 1710000000500,
      });
      checkpointDuringExecution = getLocalAgentTask(
        "user-1",
        task.id
      )?.checkpoints.at(-1);

      return {
        project: {
          ...project,
          researchSession: {
            phase: "equilibrium",
            directions: [],
            messages: [],
            assetSummary: {
              confirmedAssumptions: [],
              utilityFunctions: [],
              equilibriumStatus: "not_started",
              nextActions: [],
            },
          },
        },
      };
    },
  });

  assert.equal(completed.status, "completed");
  assert.equal(checkpointDuringExecution?.id, "math-artifact-artifact-progress-solver-attempt");
  assert.equal(checkpointDuringExecution?.stepId, "review-equilibrium");
  assert.equal(checkpointDuringExecution?.status, "completed");
  assert.equal(
    checkpointDuringExecution?.metadata?.mathArtifactId,
    "artifact-progress-solver-attempt"
  );
  assert.equal(
    checkpointDuringExecution?.metadata?.mathArtifactKind,
    "solver_attempt"
  );
  assert.equal(
    checkpointDuringExecution?.metadata?.mathArtifactIssueCount,
    0
  );
  assert.deepEqual(
    checkpointDuringExecution?.metadata?.mathArtifactOutputKeys,
    ["solutions"]
  );
  assert.deepEqual(
    checkpointDuringExecution?.metadata?.mathArtifactSnapshot,
    {
      kind: "solver_attempt",
      status: "passed",
      source: "sympy",
      input: {
        residuals: ["2*tau_A-alpha_B"],
      },
      output: {
        solutions: [{ tau_A: "alpha_B/2" }],
      },
      issues: [],
    }
  );
  assert.equal(
    JSON.stringify(checkpointDuringExecution).includes("sk-progress-secret"),
    false
  );
  assert.equal(
    JSON.stringify(checkpointDuringExecution).includes("sk-solver-secret"),
    false
  );
});

test("runAgentTask saves math artifacts to the project during execution before later failure", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-progress-before-failure",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });
  const savedProjects = [];

  const failed = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    now: 1710000001000,
    leaseMs: 60_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
      researchSession: {
        phase: "equilibrium",
        directions: [],
        messages: [],
        assetSummary: {
          confirmedAssumptions: [],
          utilityFunctions: [],
          equilibriumStatus: "not_started",
          nextActions: [],
        },
      },
    }),
    saveProject: async ({ project }) => {
      savedProjects.push(project);
      return project;
    },
    executeAction: async ({ onMathArtifact }) => {
      await onMathArtifact({
        id: "artifact-progress-before-failure",
        runId: "agent-run-progress-failure",
        stepId: "review-equilibrium",
        kind: "solver_attempt",
        title: "SymPy solver attempt",
        status: "manual_review",
        source: "sympy",
        output: { solutions: [] },
        issues: ["solver returned no closed-form solution"],
        createdAt: 1710000000500,
      });

      throw new Error("repair provider failed");
    },
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "repair provider failed");
  assert.equal(savedProjects.length, 1);
  assert.equal(
    savedProjects[0].researchSession.mathArtifacts[0].id,
    "artifact-progress-before-failure"
  );
  assert.equal(
    getLocalAgentTask("user-1", task.id)?.checkpoints.at(-1)?.metadata
      ?.mathArtifactId,
    "artifact-progress-before-failure"
  );
});

test("runAgentTask does not fail a task that is already leased", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-3",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });

  claimLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    leaseUntil: 1710000061000,
    now: 1710000001000,
  });

  const secondAttempt = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-2",
    now: 1710000002000,
    leaseMs: 60_000,
    forceLocal: true,
    getProject: async () => {
      throw new Error("should not execute");
    },
    saveProject: async ({ project }) => project,
    executeAction: async () => {
      throw new Error("should not execute");
    },
  });

  assert.equal(secondAttempt.status, "running");
  assert.equal(secondAttempt.workerId, "worker-1");
  assert.equal(getLocalAgentTask("user-1", task.id)?.status, "running");
});

test("runAgentTask does not save project after losing its lease", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-lost-lease",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });
  const savedProjects = [];

  const result = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    now: 1710000001000,
    leaseMs: 1_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
    }),
    saveProject: async ({ project }) => {
      savedProjects.push(project);
      return project;
    },
    executeAction: async ({ project }) => {
      claimLocalAgentTask({
        id: task.id,
        ownerId: "user-1",
        workerId: "worker-2",
        leaseUntil: 1710000010000,
        now: 1710000003000,
      });

      return {
        project: {
          ...project,
          refinedIdea: "stale worker output",
        },
      };
    },
  });

  assert.equal(savedProjects.length, 0);
  assert.equal(result.status, "running");
  assert.equal(result.workerId, "worker-2");
  assert.equal(getLocalAgentTask("user-1", task.id)?.workerId, "worker-2");
});

test("runAgentTask keeps renewing the lease while saving project output", async () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-run-save-renewal",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
    now: 1710000000000,
  });
  const savedProjects = [];
  let staleClaimDuringSave = null;

  const result = await runAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    now: 1710000001000,
    leaseMs: 1_000,
    forceLocal: true,
    getProject: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: 1710000000000,
      rawIdea: "test idea",
      refinedIdea: "test idea",
      model: null,
      wizardCompleted: false,
      sections: [],
      references: [],
    }),
    saveProject: async ({ project }) => {
      await delay(1_100);
      staleClaimDuringSave = claimLocalAgentTask({
        id: task.id,
        ownerId: "user-1",
        workerId: "worker-2",
        leaseUntil: Date.now() + 1_000,
        now: Date.now(),
      });
      savedProjects.push(project);
      return project;
    },
    executeAction: async ({ project }) => ({
      project: {
        ...project,
        refinedIdea: "worker-1 output",
      },
    }),
  });

  assert.equal(staleClaimDuringSave, null);
  assert.equal(savedProjects.length, 1);
  assert.equal(result.status, "completed");
  assert.equal(getLocalAgentTask("user-1", task.id)?.workerId, "worker-1");
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

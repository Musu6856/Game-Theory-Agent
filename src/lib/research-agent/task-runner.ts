import type {
  AgentCheckpoint,
  AgentRun,
  AgentTask,
  AgentTaskCheckpoint,
  AgentTaskInput,
  AgentTaskResult,
  ModelSourceSettings,
  ResearchMathArtifact,
  ResearchProject,
} from "../types";
import { createInitialResearchSession } from "../research-session.ts";
import { appendAgentRunToProject } from "./trace.ts";
import {
  appendAgentTaskCheckpoint,
  claimAgentTask,
  completeAgentTask,
  failAgentTask,
  getAgentTask,
  renewAgentTaskLease,
} from "./task-store.ts";

export interface AgentTaskRunRequest {
  id: string;
  ownerId: string;
  workerId: string;
  runtimeModelSource?: ModelSourceSettings;
  leaseMs?: number;
  now?: number;
  forceLocal?: boolean;
  getProject?: AgentTaskRunnerDependencies["getProject"];
  saveProject?: AgentTaskRunnerDependencies["saveProject"];
  executeAction?: AgentTaskRunnerDependencies["executeAction"];
}

export interface AgentTaskRunnerDependencies {
  getProject: (input: {
    ownerId: string;
    projectId: string;
  }) => Promise<ResearchProject | null>;
  saveProject: (input: {
    ownerId: string;
    project: ResearchProject;
  }) => Promise<ResearchProject>;
  executeAction: (input: {
    task: AgentTask;
    project: ResearchProject;
    runtimeModelSource?: ModelSourceSettings;
    onMathArtifact: (artifact: ResearchMathArtifact) => Promise<void>;
    onAgentCheckpoint: (
      checkpoint: AgentCheckpoint,
      run: AgentRun
    ) => Promise<void>;
  }) => Promise<{ project: ResearchProject }>;
}

const DEFAULT_LEASE_MS = 10 * 60 * 1000;

type ExecutableAgentTaskAction =
  | "build_model"
  | "solve_equilibrium"
  | "analyze_properties"
  | "draft_paper"
  | "revise_paper_section";

export async function runAgentTask({
  id,
  ownerId,
  workerId,
  runtimeModelSource,
  leaseMs = DEFAULT_LEASE_MS,
  now = Date.now(),
  forceLocal,
  getProject,
  saveProject,
  executeAction,
}: AgentTaskRunRequest) {
  const dependencies = resolveDependencies({
    getProject,
    saveProject,
    executeAction,
  });
  const claimed = await claimAgentTask({
    id,
    ownerId,
    workerId,
    leaseMs,
    now,
    forceLocal,
  });

  if (!claimed) {
    const current = await getAgentTask(ownerId, id, { forceLocal });
    if (current) return current;

    const failed = await failAgentTask({
      id,
      ownerId,
      error: "Task is not claimable",
      now,
      forceLocal,
    });
    if (failed) return failed;
    throw new Error("Task is not claimable");
  }

  const leaseRenewal = startLeaseRenewal({
    renew: () =>
      renewCurrentWorkerLease({
        id,
        ownerId,
        workerId,
        leaseMs,
        forceLocal,
      }),
    intervalMs: getLeaseRenewalIntervalMs(leaseMs),
  });

  try {
    const project = await dependencies.getProject({
      ownerId,
      projectId: claimed.projectId,
    });
    if (!project) throw new Error("Project not found");
    let progressProject = project;

    const result = await dependencies.executeAction({
      task: claimed,
      project,
      runtimeModelSource,
      onAgentCheckpoint: async (checkpoint, run) => {
        const checkpointWritten = await appendAgentRunTaskCheckpoint({
          id,
          ownerId,
          workerId,
          leaseMs,
          checkpoint,
          forceLocal,
          hasLostLease: leaseRenewal.hasLostLease,
        });
        if (!checkpointWritten || leaseRenewal.hasLostLease()) return;

        const renewed = await renewCurrentWorkerLease({
          id,
          ownerId,
          workerId,
          leaseMs,
          forceLocal,
        });
        if (!renewed) return;

        progressProject = appendAgentRunToProject(progressProject, run);
        await dependencies.saveProject({
          ownerId,
          project: progressProject,
        });
      },
      onMathArtifact: async (artifact) => {
        const checkpointWritten = await appendMathArtifactTaskCheckpoint({
          id,
          ownerId,
          workerId,
          leaseMs,
          artifact,
          forceLocal,
          hasLostLease: leaseRenewal.hasLostLease,
        });
        if (!checkpointWritten || leaseRenewal.hasLostLease()) return;

        const renewed = await renewCurrentWorkerLease({
          id,
          ownerId,
          workerId,
          leaseMs,
          forceLocal,
        });
        if (!renewed) return;

        progressProject = appendMathArtifactToProject(progressProject, artifact);
        await dependencies.saveProject({
          ownerId,
          project: progressProject,
        });
      },
    });
    if (leaseRenewal.hasLostLease()) {
      return getCurrentTaskOrThrow({
        id,
        ownerId,
        forceLocal,
        message: "Agent task lease was lost before saving project",
      });
    }

    const renewed = await renewCurrentWorkerLease({
      id,
      ownerId,
      workerId,
      leaseMs,
      forceLocal,
    });
    if (!renewed) {
      return getCurrentTaskOrThrow({
        id,
        ownerId,
        forceLocal,
        message: "Agent task lease was lost before saving project",
      });
    }

    await syncTaskCheckpointsFromProject({
      id,
      ownerId,
      workerId,
      project: result.project,
      now: Date.now(),
      forceLocal,
    });
    const savedProject = await dependencies.saveProject({
      ownerId,
      project: result.project,
    });
    if (leaseRenewal.hasLostLease()) {
      return getCurrentTaskOrThrow({
        id,
        ownerId,
        forceLocal,
        message: "Agent task lease was lost while saving project",
      });
    }
    const renewedAfterSave = await renewCurrentWorkerLease({
      id,
      ownerId,
      workerId,
      leaseMs,
      forceLocal,
    });
    if (!renewedAfterSave) {
      return getCurrentTaskOrThrow({
        id,
        ownerId,
        forceLocal,
        message: "Agent task lease was lost after saving project",
      });
    }
    const taskResult = createTaskResult(savedProject);

    const completed = await completeAgentTask({
      id,
      ownerId,
      workerId,
      result: taskResult,
      now,
      forceLocal,
    });
    if (completed) return completed;
    throw new Error("Agent task could not be completed by current worker");
  } catch (error) {
    leaseRenewal.stop();
    const failed = await failAgentTask({
      id,
      ownerId,
      workerId,
      error: error instanceof Error ? error.message : "Agent task failed",
      now,
      forceLocal,
    });
    if (failed) return failed;
    const current = await getAgentTask(ownerId, id, { forceLocal });
    if (current) return current;
    throw error;
  } finally {
    leaseRenewal.stop();
  }
}

async function appendAgentRunTaskCheckpoint({
  id,
  ownerId,
  workerId,
  leaseMs,
  checkpoint,
  forceLocal,
  hasLostLease,
}: {
  id: string;
  ownerId: string;
  workerId: string;
  leaseMs: number;
  checkpoint: AgentCheckpoint;
  forceLocal?: boolean;
  hasLostLease: () => boolean;
}) {
  if (hasLostLease()) return false;

  const renewed = await renewCurrentWorkerLease({
    id,
    ownerId,
    workerId,
    leaseMs,
    forceLocal,
  });
  if (!renewed) return false;

  const updated = await appendAgentTaskCheckpoint({
    id,
    ownerId,
    workerId,
    now: Date.now(),
    forceLocal,
    checkpoint: {
      id: checkpoint.id,
      stepId: checkpoint.stepId,
      title: checkpoint.title,
      status: checkpoint.status,
      ...(checkpoint.toolName ? { toolName: checkpoint.toolName } : {}),
      createdAt: checkpoint.createdAt,
      metadata: compactCheckpointMetadata({
        ...(checkpoint.metadata ?? {}),
        runId: checkpoint.runId,
      }),
    },
  });
  return Boolean(updated);
}

async function appendMathArtifactTaskCheckpoint({
  id,
  ownerId,
  workerId,
  leaseMs,
  artifact,
  forceLocal,
  hasLostLease,
}: {
  id: string;
  ownerId: string;
  workerId: string;
  leaseMs: number;
  artifact: ResearchMathArtifact;
  forceLocal?: boolean;
  hasLostLease: () => boolean;
}) {
  if (hasLostLease()) return false;

  const renewed = await renewCurrentWorkerLease({
    id,
    ownerId,
    workerId,
    leaseMs,
    forceLocal,
  });
  if (!renewed) return false;

  const updated = await appendAgentTaskCheckpoint({
    id,
    ownerId,
    workerId,
    now: Date.now(),
    forceLocal,
    checkpoint: {
      id: `math-artifact-${artifact.id}`,
      stepId: artifact.stepId,
      title: artifact.title,
      status: mapMathArtifactStatusToCheckpointStatus(artifact.status),
      createdAt: artifact.createdAt,
      metadata: {
        ...(artifact.runId ? { runId: artifact.runId } : {}),
        ...(artifact.patchId ? { patchId: artifact.patchId } : {}),
        mathArtifactId: artifact.id,
        mathArtifactKind: artifact.kind,
        mathArtifactStatus: artifact.status,
        mathArtifactSource: artifact.source,
        mathArtifactCreatedAt: artifact.createdAt,
        mathArtifactIssueCount: artifact.issues?.length ?? 0,
        mathArtifactOutputKeys: listSafeObjectKeys(artifact.output),
        mathArtifactSnapshot: createMathArtifactCheckpointSnapshot(artifact),
      },
    },
  });
  return Boolean(updated);
}

function listSafeObjectKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !isSensitiveArtifactKey(key)).slice(0, 12);
}

function compactCheckpointMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !isSensitiveArtifactKey(key))
      .slice(0, 20)
      .map(([key, value]) => [
        key,
        compactMathArtifactCheckpointValue(value),
      ])
  );
}

function createMathArtifactCheckpointSnapshot(artifact: ResearchMathArtifact) {
  return {
    kind: artifact.kind,
    status: artifact.status,
    source: artifact.source,
    input: compactMathArtifactCheckpointValue(artifact.input),
    output: compactMathArtifactCheckpointValue(artifact.output),
    issues: (artifact.issues ?? []).slice(0, 5),
  };
}

function compactMathArtifactCheckpointValue(
  value: unknown,
  depth = 0
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactSecretLikeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value
      .slice(0, 8)
      .map((entry) => compactMathArtifactCheckpointValue(entry, depth + 1));
  }

  if (typeof value !== "object") return undefined;
  if (depth >= 4) return "[truncated]";

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveArtifactKey(key))
      .slice(0, 16)
      .map(([key, entry]) => [
        key,
        compactMathArtifactCheckpointValue(entry, depth + 1),
      ])
  );
}

function redactSecretLikeString(value: string) {
  if (
    /^(sk|tvly)-[A-Za-z0-9_-]{8,}/.test(value) ||
    /^postgres(?:ql)?:\/\//i.test(value) ||
    /^Bearer\s+\S+/i.test(value)
  ) {
    return "[redacted]";
  }

  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}

function isSensitiveArtifactKey(key: string) {
  const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    compact === "runtimemodelsource" ||
    compact === "authorization" ||
    compact === "apikey" ||
    compact === "xapikey" ||
    compact.endsWith("apikey") ||
    compact === "token" ||
    compact.endsWith("token") ||
    compact === "secret" ||
    compact.endsWith("secret") ||
    compact.includes("secretkey")
  );
}

function mapMathArtifactStatusToCheckpointStatus(
  status: ResearchMathArtifact["status"]
) {
  return status === "failed" ? "failed" : "completed";
}

function appendMathArtifactToProject(
  project: ResearchProject,
  artifact: ResearchMathArtifact
): ResearchProject {
  const session =
    project.researchSession ?? createInitialResearchSession(project.rawIdea);
  const byId = new Map<string, ResearchMathArtifact>();

  [...(session.mathArtifacts ?? []), artifact].forEach((entry) => {
    byId.set(entry.id, entry);
  });

  return {
    ...project,
    researchSession: {
      ...session,
      mathArtifacts: [...byId.values()].slice(-50),
    },
  };
}

function resolveDependencies(
  dependencies: Partial<AgentTaskRunnerDependencies>
): AgentTaskRunnerDependencies {
  if (
    dependencies.getProject &&
    dependencies.saveProject &&
    dependencies.executeAction
  ) {
    return dependencies as AgentTaskRunnerDependencies;
  }

  return {
    getProject: async (input) => {
      const { getProjectForOwner } = await import("../server-project-store.ts");
      return getProjectForOwner(input);
    },
    saveProject: async (input) => {
      const { saveProjectForOwner } = await import("../server-project-store.ts");
      return saveProjectForOwner(input);
    },
    executeAction: executeAgentTaskAction,
  };
}

function createTaskResult(project: ResearchProject): AgentTaskResult {
  const session = project.researchSession;
  const runId = session?.agentRun?.id;
  const runMathArtifacts = runId
    ? (session?.mathArtifacts ?? []).filter((artifact) => artifact.runId === runId)
    : [];
  const existingPatchIds = new Set(
    (session?.assetPatches ?? []).map((patch) => patch.id)
  );
  const patchIds = runId
    ? [
        ...new Set([
          ...(session?.agentRun?.checkpoints ?? [])
            .filter((checkpoint) => checkpoint.runId === runId)
            .map((checkpoint) => checkpoint.metadata?.patchId)
            .filter(isString),
          ...runMathArtifacts
            .map((artifact) => artifact.patchId)
            .filter(isString),
        ]),
      ].filter((patchId) => existingPatchIds.has(patchId))
    : [];
  const mathArtifactIds = runMathArtifacts.map((artifact) => artifact.id);

  return {
    projectId: project.id,
    ...(runId ? { runId } : {}),
    ...(patchIds.length > 0 ? { patchIds } : {}),
    ...(mathArtifactIds.length > 0 ? { mathArtifactIds } : {}),
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function syncTaskCheckpointsFromProject({
  id,
  ownerId,
  workerId,
  project,
  now,
  forceLocal,
}: {
  id: string;
  ownerId: string;
  workerId: string;
  project: ResearchProject;
  now: number;
  forceLocal?: boolean;
}) {
  const checkpoints = project.researchSession?.agentRun?.checkpoints ?? [];
  const existing = await getAgentTask(ownerId, id, { forceLocal });
  const existingKeys = new Set(
    (existing?.checkpoints ?? []).map(createTaskCheckpointKey)
  );

  for (const checkpoint of checkpoints) {
    const taskCheckpoint: AgentTaskCheckpoint = {
      id: checkpoint.id,
      stepId: checkpoint.stepId,
      title: checkpoint.title,
      status: checkpoint.status,
      ...(checkpoint.toolName ? { toolName: checkpoint.toolName } : {}),
      createdAt: checkpoint.createdAt,
      metadata: {
        ...(checkpoint.metadata ?? {}),
        runId: checkpoint.runId,
      },
    };
    const key = createTaskCheckpointKey(taskCheckpoint);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);

    await appendAgentTaskCheckpoint({
      id,
      ownerId,
      workerId,
      checkpoint: taskCheckpoint,
      now,
      forceLocal,
    });
  }
}

async function renewCurrentWorkerLease({
  id,
  ownerId,
  workerId,
  leaseMs,
  forceLocal,
}: {
  id: string;
  ownerId: string;
  workerId: string;
  leaseMs: number;
  forceLocal?: boolean;
}) {
  return renewAgentTaskLease({
    id,
    ownerId,
    workerId,
    leaseMs,
    now: Date.now(),
    forceLocal,
  });
}

async function getCurrentTaskOrThrow({
  id,
  ownerId,
  forceLocal,
  message,
}: {
  id: string;
  ownerId: string;
  forceLocal?: boolean;
  message: string;
}) {
  const current = await getAgentTask(ownerId, id, { forceLocal });
  if (current) return current;
  throw new Error(message);
}

function startLeaseRenewal({
  renew,
  intervalMs,
}: {
  renew: () => Promise<AgentTask | null>;
  intervalMs: number;
}) {
  let stopped = false;
  let lostLease = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (stopped || intervalMs <= 0) return;

    timeout = setTimeout(() => {
      void renew()
        .then((task) => {
          if (!task) {
            lostLease = true;
            return;
          }
          schedule();
        })
        .catch(() => {
          lostLease = true;
        });
    }, intervalMs);
  };

  schedule();

  return {
    hasLostLease: () => lostLease,
    stop: () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
    },
  };
}

function getLeaseRenewalIntervalMs(leaseMs: number) {
  if (leaseMs <= 0) return 0;
  return Math.max(1000, Math.floor(leaseMs / 2));
}

function createTaskCheckpointKey(checkpoint: AgentTaskCheckpoint) {
  const runId =
    typeof checkpoint.metadata?.runId === "string"
      ? checkpoint.metadata.runId
      : "";
  return `${runId}:${checkpoint.id}:${checkpoint.stepId}:${checkpoint.status}`;
}

async function executeAgentTaskAction({
  task,
  project,
  runtimeModelSource,
  onAgentCheckpoint,
  onMathArtifact,
}: {
  task: AgentTask;
  project: ResearchProject;
  runtimeModelSource?: ModelSourceSettings;
  onAgentCheckpoint: (checkpoint: AgentCheckpoint, run: AgentRun) => Promise<void>;
  onMathArtifact: (artifact: ResearchMathArtifact) => Promise<void>;
}) {
  if (!isExecutableAgentTaskAction(task.action)) {
    throw new Error(`Unsupported agent task action: ${task.action}`);
  }

  const input = normalizeTaskInput(task);
  const complete = await createTaskProviderCompletion(
    task.action,
    runtimeModelSource ?? input.runtimeModelSource
  );

  if (task.action === "build_model") {
    if (!input.selectedDirectionId) {
      throw new Error("selectedDirectionId is required for build_model tasks");
    }
    const [{ runModelGenerationAgent }, { generateResearchProject }] =
      await Promise.all([
        import("./model-runner.ts"),
        import("../ai-research-generation.ts"),
      ]);

    return runModelGenerationAgent(
      {
        rawIdea: input.rawIdea,
        selectedDirectionId: input.selectedDirectionId,
        project,
        resume: input.resume,
      },
      { complete, buildModel: generateResearchProject, onAgentCheckpoint }
    );
  }

  if (task.action === "solve_equilibrium") {
    const [{ runEquilibriumSolvingAgent }, { generateResearchProject }] =
      await Promise.all([
        import("./equilibrium-runner.ts"),
        import("../ai-research-generation.ts"),
      ]);

    return runEquilibriumSolvingAgent(
      {
        rawIdea: input.rawIdea,
        project,
        resume: input.resume,
      },
      {
        complete,
        solveEquilibrium: generateResearchProject,
        onAgentCheckpoint,
        onMathArtifact,
      }
    );
  }

  if (task.action === "analyze_properties") {
    const [{ runPropertyAnalysisAgent }, { generateResearchProject }] =
      await Promise.all([
        import("./property-runner.ts"),
        import("../ai-research-generation.ts"),
      ]);

    return runPropertyAnalysisAgent(
      {
        rawIdea: input.rawIdea,
        project,
        resume: input.resume,
      },
      { complete, analyzeProperties: generateResearchProject, onAgentCheckpoint }
    );
  }

  if (task.action === "draft_paper") {
    const { runPaperOutputAgent } = await import("./paper-runner.ts");
    return runPaperOutputAgent(
      {
        rawIdea: input.rawIdea,
        project,
        resume: input.resume,
      },
      { onAgentCheckpoint }
    );
  }

  if (task.action === "revise_paper_section") {
    if (!input.sectionId) {
      throw new Error("sectionId is required for revise_paper_section tasks");
    }
    const { runPaperSectionRevisionAgent } = await import(
      "./paper-section-runner.ts"
    );
    return runPaperSectionRevisionAgent(
      {
        rawIdea: input.rawIdea,
        project,
        sectionId: input.sectionId,
        instruction: input.instruction,
        resume: input.resume,
      },
      { onAgentCheckpoint }
    );
  }

  throw new Error(`Unsupported agent task action: ${task.action}`);
}

async function createTaskProviderCompletion(
  action: ExecutableAgentTaskAction,
  runtimeModelSource?: ModelSourceSettings
) {
  const [
    { completeProviderChat, getProviderConfigForModelSource },
    { normalizeModelSourceSettings },
    { getProviderTimeoutMs },
  ] = await Promise.all([
    import("../provider.ts"),
    import("../model-source.ts"),
    import("../research-generation-timeout.ts"),
  ]);
  const modelSource = runtimeModelSource
    ? normalizeModelSourceSettings(runtimeModelSource)
    : undefined;
  const provider = getProviderConfigForModelSource(modelSource);
  if (!provider.apiKey) return undefined;

  const timeoutMs = getProviderTimeoutMs(action);
  return async (
    messages: Parameters<typeof completeProviderChat>[1]["messages"]
  ) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await completeProviderChat(
        {
          ...provider,
          apiKey: provider.apiKey,
        },
        {
          signal: controller.signal,
          messages,
          maxCompletionTokens: 4096,
          responseFormat: "json_object",
          temperature: 0.2,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

function normalizeTaskInput(task: AgentTask): AgentTaskInput {
  const input = task.input as Partial<AgentTaskInput>;
  if (typeof input.rawIdea !== "string" || !input.rawIdea.trim()) {
    throw new Error("rawIdea is required for agent tasks");
  }

  return {
    ...input,
    rawIdea: input.rawIdea,
    action: task.action,
    projectId: task.projectId,
  };
}

function isExecutableAgentTaskAction(
  action: AgentTask["action"]
): action is ExecutableAgentTaskAction {
  return (
    action === "build_model" ||
    action === "solve_equilibrium" ||
    action === "analyze_properties" ||
    action === "draft_paper" ||
    action === "revise_paper_section"
  );
}

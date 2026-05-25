import type {
  ModelSourceMetadata,
  ResearchDirection,
  ResearchProject,
  ResearchSessionMessage,
} from "../types";
import type {
  LlmMessage,
  ResearchCompletionClient,
} from "../research-generation/types.ts";
import { createExplorationProject } from "../research-session.ts";
import { extractFirstJsonObject, parseDirections } from "../research-generation/parsers.ts";
import { createEvidenceSearchQueries } from "./query.ts";
import { createDirectionDiscoveryPlan } from "./planner.ts";
import {
  appendTraceEvent,
  completeAgentRun,
  createAgentRun,
  updateStepStatus,
  type AgentRun,
  type EvidencePack,
} from "./state.ts";
import {
  buildEvidencePack,
  type EvidenceCandidate,
} from "./tools/evidence-pack.ts";
import { searchOpenLiterature } from "./tools/literature-search.ts";
import { searchPublicWebContext } from "./tools/web-search.ts";
import { createDirectionWithEvidencePrompt } from "./prompts/direction-with-evidence-prompt.ts";
import { appendAgentRunToProject } from "./trace.ts";

export type DirectionDiscoveryAgentRequest = {
  rawIdea: string;
  modelSource?: ModelSourceMetadata;
  useOnlineEvidence?: boolean;
};

export type DirectionDiscoveryAgentClient = ResearchCompletionClient & {
  searchLiterature?: (query: string) => Promise<EvidenceCandidate[]>;
  searchWeb?: (query: string) => Promise<EvidenceCandidate[]>;
};

export type DirectionDiscoveryAgentResult = {
  project: ResearchProject;
  usedFallback: boolean;
  assistantMessage: string;
  evidencePack: EvidencePack;
  agentRun: AgentRun;
};

type DirectionPayload = {
  assistantMessage?: unknown;
  directions?: unknown;
};

export async function runDirectionDiscoveryAgent(
  request: DirectionDiscoveryAgentRequest,
  client: DirectionDiscoveryAgentClient = {}
): Promise<DirectionDiscoveryAgentResult> {
  const now = client.now ?? Date.now();
  const runId = client.id ? `agent-${client.id}` : `agent-${now}`;
  let agentRun = createAgentRun({
    id: runId,
    action: "discover_directions",
    goal: request.rawIdea.trim(),
    now,
    plan: createDirectionDiscoveryPlan(),
  });
  agentRun = appendTraceEvent(
    agentRun,
    {
      type: "plan_created",
      message: "Created first-stage direction discovery plan.",
      metadata: { stepCount: agentRun.plan.length },
    },
    now
  );

  const queries = createEvidenceSearchQueries(request.rawIdea);
  const query = buildEvidenceQuery(request.rawIdea, queries);
  const useOnlineEvidence = request.useOnlineEvidence !== false;
  let literatureSources: { run: AgentRun; sources: EvidenceCandidate[] };
  let webSources: { run: AgentRun; sources: EvidenceCandidate[] };

  if (useOnlineEvidence) {
    literatureSources = await runSearchStep({
      run: agentRun,
      stepId: "search-literature",
      toolName: "literature.search",
      queries,
      now,
      search: client.searchLiterature ?? ((value) => searchOpenLiterature(value)),
    });
    agentRun = literatureSources.run;

    webSources = await runSearchStep({
      run: agentRun,
      stepId: "search-web",
      toolName: "web.search",
      queries,
      now,
      search: client.searchWeb ?? ((value) => searchPublicWebContext(value)),
    });
    agentRun = webSources.run;
  } else {
    literatureSources = skipSearchStep({
      run: agentRun,
      stepId: "search-literature",
      toolName: "literature.search",
      queries,
      now,
    });
    agentRun = literatureSources.run;
    webSources = skipSearchStep({
      run: agentRun,
      stepId: "search-web",
      toolName: "web.search",
      queries,
      now,
    });
    agentRun = webSources.run;
  }

  agentRun = updateStepStatus(agentRun, "build-evidence-pack", "running", now);
  const evidencePack = buildEvidencePack({
    query,
    sources: [...literatureSources.sources, ...webSources.sources],
    now,
    maxSources: 8,
  });
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "build-evidence-pack",
      type: "tool_result",
      message: "Built concise evidence pack.",
      metadata: {
        onlineEvidenceEnabled: useOnlineEvidence,
        sourceCount: evidencePack.sources.length,
        paperSourceCount: evidencePack.sources.filter(
          (source) => source.sourceType === "paper"
        ).length,
        webSourceCount: evidencePack.sources.filter(
          (source) => source.sourceType === "web"
        ).length,
        policySourceCount: evidencePack.sources.filter(
          (source) => source.sourceType === "policy"
        ).length,
        industrySourceCount: evidencePack.sources.filter(
          (source) => source.sourceType === "industry"
        ).length,
      },
    },
    now
  );
  agentRun = updateStepStatus(agentRun, "build-evidence-pack", "completed", now);

  const prompt = createDirectionWithEvidencePrompt({
    rawIdea: request.rawIdea,
    evidencePack,
  });
  agentRun = updateStepStatus(agentRun, "discover-directions", "running", now);
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "discover-directions",
      type: "model_call",
      message: "Requested evidence-backed direction discovery.",
      metadata: {
        sourceIds: evidencePack.sources.map((source) => source.id),
      },
    },
    now
  );

  const content = client.complete ? await client.complete(prompt) : null;
  const payload = content
    ? (extractFirstJsonObject(content) as DirectionPayload | null)
    : null;
  const parsedDirections = attachEvidenceDefaults(
    parseDirections(payload?.directions),
    evidencePack
  );
  const assistantMessage =
    typeof payload?.assistantMessage === "string" &&
    payload.assistantMessage.trim().length > 0
      ? payload.assistantMessage.trim()
      : null;

  const fallbackProject = createEvidenceBackedFallbackProject({
    rawIdea: request.rawIdea,
    id: client.id,
    now,
    modelSource: request.modelSource,
    evidencePack,
    agentRun,
  });

  if (!parsedDirections || !assistantMessage) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "discover-directions",
        type: "fallback",
        message: "Direction model output was unavailable or invalid; fallback directions were used.",
        metadata: {
          hasContent: Boolean(content),
          payloadKeys: payload ? Object.keys(payload) : [],
        },
      },
      now
    );
    agentRun = updateStepStatus(agentRun, "discover-directions", "completed", now);
    agentRun = completeAgentRun(agentRun, now);

    const project = attachAgentRunToProject(fallbackProject, agentRun);
    return {
      project,
      usedFallback: true,
      assistantMessage: project.researchSession?.messages.at(-1)?.content ?? "",
      evidencePack,
      agentRun,
    };
  }

  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "discover-directions",
      type: "model_result",
      message: "Generated evidence-backed directions.",
      metadata: {
        directionCount: parsedDirections.length,
      },
    },
    now
  );
  agentRun = updateStepStatus(agentRun, "discover-directions", "completed", now);
  agentRun = completeAgentRun(agentRun, now);

  const project = attachAgentRunToProject(
    createProjectFromDirections({
      rawIdea: request.rawIdea,
      id: client.id,
      now,
      modelSource: request.modelSource,
      directions: parsedDirections,
      assistantMessage,
      evidencePack,
      agentRun,
    }),
    agentRun
  );

  return {
    project,
    usedFallback: false,
    assistantMessage,
    evidencePack,
    agentRun,
  };
}

async function runSearchStep({
  run,
  stepId,
  toolName,
  queries,
  now,
  search,
}: {
  run: AgentRun;
  stepId: string;
  toolName: string;
  queries: string[];
  now: number;
  search: (query: string) => Promise<EvidenceCandidate[]>;
}): Promise<{ run: AgentRun; sources: EvidenceCandidate[] }> {
  let nextRun = updateStepStatus(run, stepId, "running", now);
  nextRun = appendTraceEvent(
    nextRun,
    {
      stepId,
      type: "tool_call",
      message: `Calling ${toolName}.`,
      metadata: { query: queries[0] ?? "", queries },
    },
    now
  );

  try {
    const results = await Promise.allSettled(
      queries.map((query) => search(query))
    );
    const sources = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
    nextRun = appendTraceEvent(
      nextRun,
      {
        stepId,
        type: "tool_result",
        message: `${toolName} returned ${sources.length} candidate sources.`,
        metadata: {
          queryCount: queries.length,
          failedQueryCount: results.filter((result) => result.status === "rejected").length,
          resultCount: sources.length,
        },
      },
      now
    );
    nextRun = updateStepStatus(nextRun, stepId, "completed", now);
    return { run: nextRun, sources };
  } catch (error) {
    nextRun = appendTraceEvent(
      nextRun,
      {
        stepId,
        type: "error",
        message: `${toolName} failed; continuing with available evidence.`,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
      now
    );
    nextRun = updateStepStatus(nextRun, stepId, "failed", now);
    return { run: { ...nextRun, status: "running" }, sources: [] };
  }
}

function skipSearchStep({
  run,
  stepId,
  toolName,
  queries,
  now,
}: {
  run: AgentRun;
  stepId: string;
  toolName: string;
  queries: string[];
  now: number;
}): { run: AgentRun; sources: EvidenceCandidate[] } {
  let nextRun = updateStepStatus(run, stepId, "skipped", now);
  nextRun = appendTraceEvent(
    nextRun,
    {
      stepId,
      type: "tool_result",
      message: `${toolName} skipped because online evidence is disabled.`,
      metadata: {
        onlineEvidenceEnabled: false,
        queryCount: queries.length,
        resultCount: 0,
      },
    },
    now
  );
  return { run: nextRun, sources: [] };
}

function buildEvidenceQuery(rawIdea: string, queries: string[]) {
  return [rawIdea.trim(), ...queries.slice(1)].filter(Boolean).join(" | ");
}

function createEvidenceBackedFallbackProject({
  rawIdea,
  id,
  now,
  modelSource,
  evidencePack,
  agentRun,
}: {
  rawIdea: string;
  id?: string;
  now: number;
  modelSource?: ModelSourceMetadata;
  evidencePack: EvidencePack;
  agentRun: AgentRun;
}) {
  const project = createExplorationProject({
    id,
    rawIdea,
    now,
    modelSource,
  });
  const directions = attachEvidenceDefaults(
    project.researchSession?.directions ?? [],
    evidencePack
  ) ?? [];

  return createProjectFromDirections({
    rawIdea,
    id,
    now,
    modelSource,
    directions,
    assistantMessage:
      "我先给出一组可推进的理论建模方向；本轮没有拿到足够稳定的模型输出，因此方向采用保守兜底版本，并保留 evidence pack 供你审阅。",
    evidencePack,
    agentRun,
  });
}

function createProjectFromDirections({
  rawIdea,
  id,
  now,
  modelSource,
  directions,
  assistantMessage,
  evidencePack,
  agentRun,
}: {
  rawIdea: string;
  id?: string;
  now: number;
  modelSource?: ModelSourceMetadata;
  directions: ResearchDirection[];
  assistantMessage: string;
  evidencePack: EvidencePack;
  agentRun: AgentRun;
}): ResearchProject {
  const project = createExplorationProject({
    id,
    rawIdea,
    now,
    modelSource,
  });
  const messages: ResearchSessionMessage[] = [
    {
      id: "msg-user-initial",
      role: "user",
      content: rawIdea.trim(),
      createdAt: 0,
    },
    {
      id: "msg-assistant-directions",
      role: "assistant",
      content: assistantMessage,
      createdAt: 0,
    },
  ];

  return {
    ...project,
    refinedIdea: rawIdea.trim(),
    researchSession: {
      phase: "direction",
      directions,
      messages,
      evidencePack,
      agentRun,
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "not_started",
        nextActions: ["选择一个有证据支撑的研究方向"],
        pendingDecision: {
          kind: "choose_direction",
          prompt: "请选择一个研究方向；下一步会先提出可审阅的模型设定，而不是直接覆盖资产。",
        },
      },
    },
  };
}

function attachAgentRunToProject(project: ResearchProject, agentRun: AgentRun) {
  return appendAgentRunToProject(project, agentRun);
}

function attachEvidenceDefaults(
  directions: ResearchDirection[] | null,
  evidencePack: EvidencePack
) {
  if (!directions) return null;
  const fallbackSourceIds =
    evidencePack.sources.length > 0 ? [evidencePack.sources[0].id] : [];
  const fallbackNote =
    evidencePack.sources.length > 0
      ? "Supported by the first retained source in the evidence pack."
      : "No reliable source found in this run.";

  return directions.map((direction, index) => ({
    ...direction,
    evidenceSourceIds:
      direction.evidenceSourceIds ??
      (index === 0 ? fallbackSourceIds : []),
    evidenceNote: direction.evidenceNote ?? fallbackNote,
  }));
}

export function createAgentCompletionClient(
  complete: ResearchCompletionClient["complete"]
): Pick<DirectionDiscoveryAgentClient, "complete"> {
  return { complete };
}

export type { LlmMessage };

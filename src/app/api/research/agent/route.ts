import { completeProviderChat, getProviderConfigForModelSource, jsonError } from "@/lib/provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { getProviderTimeoutMs } from "@/lib/research-generation-timeout";
import { getRequestUserId } from "@/lib/server-auth";
import { normalizeModelSourceSettings } from "@/lib/model-source";
import { runEquilibriumSolvingAgent } from "@/lib/research-agent/equilibrium-runner";
import { runModelGenerationAgent } from "@/lib/research-agent/model-runner";
import { runPaperOutputAgent } from "@/lib/research-agent/paper-runner";
import { runPaperSectionRevisionAgent } from "@/lib/research-agent/paper-section-runner";
import { runPropertyAnalysisAgent } from "@/lib/research-agent/property-runner";
import { runDirectionDiscoveryAgent } from "@/lib/research-agent/runner";
import { generateResearchProject } from "@/lib/ai-research-generation";
import type { EquilibriumSolvingAgentRequest } from "@/lib/research-agent/equilibrium-runner";
import type { DirectionDiscoveryAgentRequest } from "@/lib/research-agent/runner";
import type { ModelGenerationAgentRequest } from "@/lib/research-agent/model-runner";
import type { PaperOutputAgentRequest } from "@/lib/research-agent/paper-runner";
import type { PaperSectionRevisionAgentRequest } from "@/lib/research-agent/paper-section-runner";
import type { PropertyAnalysisAgentRequest } from "@/lib/research-agent/property-runner";
import type { ModelSourceSettings } from "@/lib/types";

type AgentRouteRequest =
  | (DirectionDiscoveryAgentRequest & {
      action?: "discover_directions";
      runtimeModelSource?: ModelSourceSettings;
      useOnlineEvidence?: boolean;
    })
  | (ModelGenerationAgentRequest & {
      action: "build_model";
      runtimeModelSource?: ModelSourceSettings;
    })
  | (EquilibriumSolvingAgentRequest & {
      action: "solve_equilibrium";
      runtimeModelSource?: ModelSourceSettings;
    })
  | (PropertyAnalysisAgentRequest & {
      action: "analyze_properties";
      runtimeModelSource?: ModelSourceSettings;
    })
  | (PaperOutputAgentRequest & {
      action: "draft_paper";
      runtimeModelSource?: ModelSourceSettings;
    })
  | (PaperSectionRevisionAgentRequest & {
      action: "revise_paper_section";
      runtimeModelSource?: ModelSourceSettings;
    });

export async function POST(request: Request) {
  const userId = await getRequestUserId();

  if (!userId) {
    return jsonError("Unauthorized", 401, "unauthorized");
  }

  const limit = checkRateLimit(userId);
  if (!limit.ok) {
    return jsonError(
      `Too many requests. Try again in ${limit.retryAfter}s.`,
      429,
      "rate_limited"
    );
  }

  let body: AgentRouteRequest;
  try {
    body = (await request.json()) as AgentRouteRequest;
  } catch {
    return jsonError("Invalid JSON body", 400, "invalid_json");
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return jsonError(validationError, 400, "invalid_agent_request");
  }

  let runtimeModelSource;
  try {
    runtimeModelSource = body.runtimeModelSource
      ? normalizeModelSourceSettings(body.runtimeModelSource)
      : undefined;
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid runtime model source",
      400,
      "invalid_runtime_model_source"
    );
  }

  let provider;
  try {
    provider = getProviderConfigForModelSource(runtimeModelSource);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unsupported runtime model source",
      400,
      "unsupported_runtime_model_source"
    );
  }

  const complete = createProviderCompletion(provider, body.action);
  const result = await runAgentRequest(body, complete);

  return Response.json(result);
}

function validateRequest(body: AgentRouteRequest) {
  if (!body || typeof body !== "object") {
    return "Request body is required";
  }

  if (
    body.action !== undefined &&
    body.action !== "discover_directions" &&
    body.action !== "build_model" &&
    body.action !== "solve_equilibrium" &&
    body.action !== "analyze_properties" &&
    body.action !== "draft_paper" &&
    body.action !== "revise_paper_section"
  ) {
    return "Invalid action";
  }

  if (typeof body.rawIdea !== "string" || body.rawIdea.trim().length === 0) {
    return "rawIdea is required";
  }

  if (
    body.action === "discover_directions" &&
    body.useOnlineEvidence !== undefined &&
    typeof body.useOnlineEvidence !== "boolean"
  ) {
    return "useOnlineEvidence must be a boolean";
  }

  if (body.action === "build_model") {
    if (
      typeof body.selectedDirectionId !== "string" ||
      body.selectedDirectionId.trim().length === 0
    ) {
      return "selectedDirectionId is required";
    }

    if (!body.project || typeof body.project !== "object") {
      return "project is required";
    }
  }

  if (
    body.action === "solve_equilibrium" ||
    body.action === "analyze_properties" ||
    body.action === "draft_paper" ||
    body.action === "revise_paper_section"
  ) {
    if (!body.project || typeof body.project !== "object") {
      return "project is required";
    }
  }

  if (
    body.action === "revise_paper_section" &&
    (typeof body.sectionId !== "string" || body.sectionId.trim().length === 0)
  ) {
    return "sectionId is required";
  }

  return null;
}

function runAgentRequest(
  body: AgentRouteRequest,
  complete: Awaited<ReturnType<typeof createProviderCompletion>>
) {
  if (body.action === "build_model") {
    return runModelGenerationAgent(
      {
        rawIdea: body.rawIdea,
        selectedDirectionId: body.selectedDirectionId,
        userMessage: body.userMessage,
        project: body.project,
        resume: body.resume,
      },
      {
        complete,
        buildModel: generateResearchProject,
      }
    );
  }

  if (body.action === "solve_equilibrium") {
    return runEquilibriumSolvingAgent(
      {
        rawIdea: body.rawIdea,
        project: body.project,
        resume: body.resume,
      },
      {
        complete,
        solveEquilibrium: generateResearchProject,
      }
    );
  }

  if (body.action === "analyze_properties") {
    return runPropertyAnalysisAgent(
      {
        rawIdea: body.rawIdea,
        project: body.project,
        resume: body.resume,
      },
      {
        complete,
        analyzeProperties: generateResearchProject,
      }
    );
  }

  if (body.action === "draft_paper") {
    return runPaperOutputAgent({
      rawIdea: body.rawIdea,
      project: body.project,
      resume: body.resume,
    });
  }

  if (body.action === "revise_paper_section") {
    return runPaperSectionRevisionAgent({
      rawIdea: body.rawIdea,
      project: body.project,
      sectionId: body.sectionId,
      instruction: body.instruction,
      resume: body.resume,
    });
  }

  return runDirectionDiscoveryAgent(
    {
      rawIdea: body.rawIdea,
      modelSource: body.modelSource,
      useOnlineEvidence: body.useOnlineEvidence,
    },
    {
      complete,
    }
  );
}

function createProviderCompletion(
  provider: ReturnType<typeof getProviderConfigForModelSource>,
  action: AgentRouteRequest["action"]
) {
  if (!provider.apiKey) return undefined;

  const timeoutMs = getProviderTimeoutMs(action ?? "discover_directions");
  return async (messages: Parameters<typeof completeProviderChat>[1]["messages"]) => {
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

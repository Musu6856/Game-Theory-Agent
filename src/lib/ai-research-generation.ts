import type {
  EquilibriumResult,
  HotellingModel,
  ModelSourceMetadata,
  PropertyAnalysis,
  ResearchProject,
  ResearchSessionAssetSummary,
  ResearchSessionMessage,
  SymbolDefinition,
} from "./types";
export type {
  JsonValue,
  LlmMessage,
  ResearchAssetPatch,
  ResearchAssetPatchChange,
  ResearchCompletionClient,
  ResearchGenerationAction,
  ResearchGenerationRequest,
  ResearchGenerationResponse,
} from "./research-generation/types.ts";
export { createDiscoverPrompt } from "./research-generation/prompts.ts";
export {
  extractFirstJsonObject,
  parseDirections,
} from "./research-generation/parsers.ts";
import type {
  JsonValue,
  LlmMessage,
  ResearchAssetPatch,
  ResearchAssetPatchChange,
  ResearchCompletionClient,
  ResearchGenerationRequest,
  ResearchGenerationResponse,
} from "./research-generation/types.ts";
import {
  createBuildPrompt,
  createConversationPrompt,
  createDiscoverPrompt,
  createEquilibriumPrompt,
  createPropertyAnalysisPrompt,
} from "./research-generation/prompts.ts";
import {
  appendConversationMessages,
  attachEquilibriumResult,
  attachPropertyAnalyses,
  createBuildFallback,
  createConversationFallbackAssetPatch,
  createConversationFallbackMessage,
  createConversationPatchFallbackMessage,
  createMinimalSolvableModelForDirection,
  createNarrowedModelAssistantMessage,
} from "./research-generation/fallbacks.ts";
import {
  createModelAssetSummary,
  extractFirstJsonObject,
  findDirection,
  isRecord,
  parseAssetSummary,
  parseDirections,
  parseEquilibriumResult,
  parseHotellingModel,
  parsePropertyAnalyses,
  parsePropertyAnalysis,
  parseText,
} from "./research-generation/parsers.ts";
import {
  createExplorationProject,
  createModelAwareEquilibriumScaffoldResult,
  generatePropertyAnalysis,
  generateSymbolicEquilibrium,
} from "./research-session.ts";
import { evaluateHotellingModelSolvability } from "./research-model-solvability.ts";

type DiscoverPayload = {
  assistantMessage?: unknown;
  directions?: unknown;
};

type BuildModelPayload = {
  assistantMessage?: unknown;
  selectedDirectionId?: unknown;
  refinedIdea?: unknown;
  hotellingModel?: unknown;
  assetSummary?: unknown;
};

type EquilibriumPayload = {
  assistantMessage?: unknown;
  equilibriumResult?: unknown;
};

type PropertyAnalysisPayload = {
  assistantMessage?: unknown;
  propertyAnalysis?: unknown;
  propertyAnalyses?: unknown;
};

type ConversationPayload = {
  assistantMessage?: unknown;
  assetPatch?: unknown;
};

type StructuredValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      reason: string;
    };

type StructuredCompletionResult<T> = {
  value: T | null;
  content: string | null;
  initialContent: string | null;
  repairAttempted: boolean;
  failureReason?: string;
};

type BuildModelCompletion = {
  payload: BuildModelPayload;
  hotellingModel: HotellingModel;
  assistantMessage: string;
  selectedDirectionId?: string;
  refinedIdea?: string;
  assetSummary?: ResearchSessionAssetSummary | null;
};

type EquilibriumCompletion = {
  payload: EquilibriumPayload;
  equilibriumResult: EquilibriumResult;
  assistantMessage: string;
};

type PropertyAnalysisCompletion = {
  payload: PropertyAnalysisPayload;
  analyses: PropertyAnalysis[];
  assistantMessage: string;
};

const BUILD_MODEL_REPAIR_SHAPE =
  "{ assistantMessage: string, hotellingModel: { symbols, sides, platforms, timing, utilityFunctions, demandDerivation, profitFunctions, assumptions, modelSetupDraft }, optional selectedDirectionId, refinedIdea, assetSummary }";

const EQUILIBRIUM_REPAIR_SHAPE =
  "{ assistantMessage: string, equilibriumResult: { status: solved | derivation_draft | implicit_system | reaction_functions | failed_with_reason | needs_model_clarification | symbolic_failure, concept, solvingSteps, focs, conditions, closedForm, derivation, code, warnings, optional solverScratchpad } }";

const PROPERTY_ANALYSIS_REPAIR_SHAPE =
  "{ assistantMessage: string, propertyAnalyses: Array<3 to 5 symbolic analyses with id,target,parameter,operation,symbolicResult,signCondition,propositionDraft,proofSketch,intuition,warnings> }";

export async function generateResearchProject(
  request: ResearchGenerationRequest,
  client: ResearchCompletionClient = {}
): Promise<ResearchGenerationResponse> {
  if (request.action === "continue_conversation") {
    return continueConversation(request, client);
  }

  if (request.action === "discover_directions") {
    return discoverDirections(request, client);
  }

  if (request.action === "solve_equilibrium") {
    return solveEquilibrium(request, client);
  }

  if (request.action === "analyze_properties") {
    return analyzeProperties(request, client);
  }

  if (request.action === "draft_paper") {
    return draftPaper(request);
  }

  return buildModel(request, client);
}

async function draftPaper(
  request: ResearchGenerationRequest
): Promise<ResearchGenerationResponse> {
  if (!request.project) {
    throw new Error("project is required for draft_paper");
  }

  return {
    project: request.project,
    usedFallback: false,
    assistantMessage:
      "论文输出需要通过 Agent 入口生成可审阅草稿建议。",
  };
}

async function continueConversation(
  request: ResearchGenerationRequest,
  client: ResearchCompletionClient
): Promise<ResearchGenerationResponse> {
  if (!request.project) {
    throw new Error("project is required for continue_conversation");
  }

  const userMessage = request.userMessage?.trim();
  if (!userMessage) {
    throw new Error("userMessage is required for continue_conversation");
  }

  const content = await tryComplete(
    client,
    createConversationPrompt(request.project, userMessage)
  );
  const payload = content ? (extractFirstJsonObject(content) as ConversationPayload | null) : null;
  const providerAssetPatch = parseConversationAssetPatch(payload?.assetPatch);
  const fallbackAssetPatch = providerAssetPatch
    ? null
    : createConversationFallbackAssetPatch(request.project, userMessage);
  const assetPatch =
    providerAssetPatch ?? fallbackAssetPatch;
  const assistantMessage =
    fallbackAssetPatch
      ? createConversationPatchFallbackMessage(fallbackAssetPatch)
      : parseText(payload?.assistantMessage) ??
        (payload
          ? createConversationFallbackMessage(request.project, userMessage)
          : extractMalformedAssistantMessage(content) ??
            createConversationFallbackMessage(request.project, userMessage));
  const usedFallback =
    !content ||
    (payload !== null && !parseText(payload.assistantMessage)) ||
    Boolean(fallbackAssetPatch);

  return {
    project: appendConversationMessages(
      request.project,
      userMessage,
      assistantMessage
    ),
    usedFallback,
    assistantMessage,
    ...(assetPatch ? { assetPatch } : {}),
  };
}

function extractMalformedAssistantMessage(content: string | null) {
  const text = parseText(content);
  if (!text) return null;
  if (!looksLikeAssistantJson(text)) return text;

  const assistantMessageMatch = text.match(
    /"assistantMessage"\s*:\s*"((?:\\.|[^"\\])*)"/
  );
  if (!assistantMessageMatch) return null;

  try {
    return parseText(JSON.parse(`"${assistantMessageMatch[1]}"`));
  } catch {
    return parseText(
      assistantMessageMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\")
    );
  }
}

function looksLikeAssistantJson(text: string) {
  return /^\s*\{/.test(text) && /"assistantMessage"\s*:/.test(text);
}

function parseConversationAssetPatch(
  value: unknown
): ResearchAssetPatch | null {
  if (!isRecord(value)) return null;

  const kind = parseConversationPatchKind(value.kind);
  const summary = parseText(value.summary);
  const rawChanges = Array.isArray(value.changes)
    ? value.changes
    : Array.isArray(value.patch)
      ? value.patch
      : Array.isArray(value.operations)
        ? value.operations
        : null;
  const changes = rawChanges
    ? rawChanges.map(parseConversationPatchChange)
    : null;

  if (!kind || !summary || !changes || changes.some((change) => !change)) {
    return null;
  }

  return {
    kind,
    summary,
    changes: changes as ResearchAssetPatchChange[],
  };
}

function parseConversationPatchChange(
  value: unknown
): ResearchAssetPatchChange | null {
  if (!isRecord(value)) return null;

  const target = parseText(value.target) ?? parseText(value.path);
  const op = parseConversationPatchOperation(value.op);
  const reason = parseText(value.reason) ?? parseText(value.note);
  if (!target || !op) return null;

  return {
    target,
    op,
    ...(Object.prototype.hasOwnProperty.call(value, "value")
      ? { value: value.value as JsonValue }
      : {}),
    ...(reason ? { reason } : {}),
  };
}

function parseConversationPatchKind(
  value: unknown
): ResearchAssetPatch["kind"] | null {
  if (
    value === "update_model" ||
    value === "model"
  ) {
    return "update_model";
  }

  if (
    value === "update_equilibrium" ||
    value === "equilibrium"
  ) {
    return "update_equilibrium";
  }

  if (
    value === "update_properties" ||
    value === "properties" ||
    value === "propertyAnalyses"
  ) {
    return "update_properties";
  }
  return null;
}

function parseConversationPatchOperation(
  value: unknown
): ResearchAssetPatchChange["op"] | null {
  if (value === "set" || value === "replace" || value === "update") {
    return "set";
  }

  if (value === "insert" || value === "append" || value === "add") {
    return "insert";
  }

  if (value === "remove" || value === "delete") {
    return "remove";
  }
  return null;
}

async function completeWithRepair<T>(
  client: ResearchCompletionClient,
  prompt: LlmMessage[],
  validate: (content: string) => StructuredValidationResult<T>,
  repair: {
    actionLabel: string;
    requiredShape: string;
  }
): Promise<StructuredCompletionResult<T>> {
  const initialContent = await tryComplete(client, prompt);
  if (!initialContent) {
    return {
      value: null,
      content: null,
      initialContent: null,
      repairAttempted: false,
    };
  }

  const initialValidation = validate(initialContent);
  if (initialValidation.ok) {
    return {
      value: initialValidation.value,
      content: initialContent,
      initialContent,
      repairAttempted: false,
    };
  }

  const repairContent = await tryComplete(
    client,
    createRepairPrompt({
      actionLabel: repair.actionLabel,
      originalPrompt: prompt,
      originalContent: initialContent,
      failureReason: initialValidation.reason,
      requiredShape: repair.requiredShape,
    })
  );

  if (!repairContent) {
    return {
      value: null,
      content: initialContent,
      initialContent,
      repairAttempted: true,
      failureReason: initialValidation.reason,
    };
  }

  const repairValidation = validate(repairContent);
  if (repairValidation.ok) {
    return {
      value: repairValidation.value,
      content: repairContent,
      initialContent,
      repairAttempted: true,
    };
  }

  return {
    value: null,
    content: repairContent,
    initialContent,
    repairAttempted: true,
    failureReason: repairValidation.reason,
  };
}

function validateBuildModelCompletion(
  content: string,
  fallbackSymbols: SymbolDefinition[]
): StructuredValidationResult<BuildModelCompletion> {
  const payload = extractFirstJsonObject(content) as BuildModelPayload | null;
  if (!payload) {
    return {
      ok: false,
      reason: "response did not contain a parseable JSON object",
    };
  }

  const hotellingModel = parseHotellingModel(payload.hotellingModel, fallbackSymbols);
  const assistantMessage = parseText(payload.assistantMessage);
  if (!hotellingModel || !assistantMessage) {
    return {
      ok: false,
      reason:
        "response must include assistantMessage and a complete hotellingModel with all required fields",
    };
  }

  return {
    ok: true,
    value: {
      payload,
      hotellingModel,
      assistantMessage,
      selectedDirectionId: parseText(payload.selectedDirectionId) ?? undefined,
      refinedIdea: parseText(payload.refinedIdea) ?? undefined,
      assetSummary: parseAssetSummary(payload.assetSummary, hotellingModel),
    },
  };
}

function validateEquilibriumCompletion(
  content: string
): StructuredValidationResult<EquilibriumCompletion> {
  const payload = extractFirstJsonObject(content) as EquilibriumPayload | null;
  if (!payload) {
    return {
      ok: false,
      reason: "response did not contain a parseable JSON object",
    };
  }

  const equilibriumResult = parseEquilibriumResult(payload.equilibriumResult);
  const assistantMessage = parseText(payload.assistantMessage);
  if (
    !equilibriumResult ||
    !assistantMessage
  ) {
    return {
      ok: false,
      reason:
        "response must include assistantMessage and a symbolic equilibriumResult or derivation draft, not numeric output",
    };
  }

  return {
    ok: true,
    value: {
      payload,
      equilibriumResult,
      assistantMessage,
    },
  };
}

function validatePropertyAnalysisCompletion(
  content: string
): StructuredValidationResult<PropertyAnalysisCompletion> {
  const payload = extractFirstJsonObject(content) as PropertyAnalysisPayload | null;
  if (!payload) {
    return {
      ok: false,
      reason: "response did not contain a parseable JSON object",
    };
  }

  const analyses = parsePropertyAnalyses(payload.propertyAnalyses);
  const assistantMessage = parseText(payload.assistantMessage);
  if (!analyses || !assistantMessage) {
    const propertyAnalysesValue = payload.propertyAnalyses;
    const analysisCount = Array.isArray(propertyAnalysesValue)
      ? propertyAnalysesValue.length
      : typeof propertyAnalysesValue;
    const invalidIndexes = Array.isArray(propertyAnalysesValue)
      ? propertyAnalysesValue
          .map((entry, index) => (parsePropertyAnalysis(entry) ? null : index))
          .filter((index) => index !== null)
      : [];

    return {
      ok: false,
      reason:
        `response must include assistantMessage and propertyAnalyses as 3 to 5 useful symbolic analyses; got count/type ${analysisCount}; invalid indexes ${invalidIndexes.join(",") || "none"}`,
    };
  }

  return {
    ok: true,
    value: {
      payload,
      analyses,
      assistantMessage,
    },
  };
}

function createRepairPrompt({
  actionLabel,
  originalPrompt,
  originalContent,
  failureReason,
  requiredShape,
}: {
  actionLabel: string;
  originalPrompt: LlmMessage[];
  originalContent: string;
  failureReason: string;
  requiredShape: string;
}): LlmMessage[] {
  return [
    {
      role: "developer",
      content:
        `Repair the previous ${actionLabel} response. The previous output failed validation: ${failureReason}. ` +
        "Return strict JSON only. Do not include markdown fences, comments, or prose outside JSON. Keep assistantMessage as Chinese Markdown text and repair the structured payload to match the required schema.",
    },
    {
      role: "user",
      content:
        "Original prompt:\n" +
        truncateRepairText(formatPromptMessagesForRepair(originalPrompt), 10000) +
        "\n\nPrevious output:\n" +
        truncateRepairText(originalContent, 8000) +
        "\n\nRequired JSON shape:\n" +
        requiredShape +
        "\n\nReturn the corrected JSON object only.",
    },
  ];
}

function formatPromptMessagesForRepair(messages: LlmMessage[]) {
  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
}

function truncateRepairText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated]`;
}

async function discoverDirections(
  request: ResearchGenerationRequest,
  client: ResearchCompletionClient
): Promise<ResearchGenerationResponse> {
  const fallbackProject = createExplorationProject({
    id: client.id,
    rawIdea: request.rawIdea,
    now: client.now,
  });
  const fallbackWithModelSource = attachModelSource(
    fallbackProject,
    request.modelSource
  );

  const content = await tryComplete(client, createDiscoverPrompt(request.rawIdea));
  const payload = content ? (extractFirstJsonObject(content) as DiscoverPayload | null) : null;
  const directions = parseDirections(payload?.directions);
  const assistantMessage = parseText(payload?.assistantMessage);

  if (!directions || !assistantMessage) {
    logGenerationFallback("discover_directions", {
      hasContent: Boolean(content),
      payloadKeys: payload ? Object.keys(payload) : [],
      directionsValueType: Array.isArray(payload?.directions)
        ? "array"
        : typeof payload?.directions,
      assistantMessageType: typeof payload?.assistantMessage,
      contentPreview: content?.slice(0, 500),
    });

    return {
      project: fallbackWithModelSource,
      usedFallback: true,
      assistantMessage:
        fallbackWithModelSource.researchSession?.messages.at(-1)?.content ?? "",
    };
  }

  const messages: ResearchSessionMessage[] = [
    {
      id: "msg-user-initial",
      role: "user",
      content: request.rawIdea.trim(),
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
    project: {
      ...fallbackWithModelSource,
      refinedIdea: request.rawIdea.trim(),
      researchSession: {
        phase: "direction",
        directions,
        messages,
        assetSummary: {
          confirmedAssumptions: [],
          utilityFunctions: [],
          equilibriumStatus: "not_started",
          nextActions: ["选择一个研究方向"],
          pendingDecision: {
            kind: "choose_direction",
            prompt: "请选择一个研究方向，之后我会把它细化为可求解的模型。",
          },
        },
      },
    },
    usedFallback: false,
    assistantMessage,
  };
}

function attachModelSource(
  project: ResearchProject,
  modelSource: ModelSourceMetadata | undefined
): ResearchProject {
  return modelSource ? { ...project, modelSource } : project;
}

async function buildModel(
  request: ResearchGenerationRequest,
  client: ResearchCompletionClient
): Promise<ResearchGenerationResponse> {
  const baseProject =
    request.project ??
    createExplorationProject({
      id: client.id,
      rawIdea: request.rawIdea,
      now: client.now,
    });
  const fallback = createBuildFallback(
    baseProject,
    request.selectedDirectionId,
    request.userMessage
  );
  const fallbackSymbols = fallback.project.hotellingModel?.symbols ?? [];
  const prompt = createBuildPrompt(request, fallbackSymbols);

  const completion = await completeWithRepair(
    client,
    prompt,
    (content) => validateBuildModelCompletion(content, fallbackSymbols),
    {
      actionLabel: "build_model",
      requiredShape: BUILD_MODEL_REPAIR_SHAPE,
    }
  );

  if (!completion.value) {
    const logContent = completion.content ?? completion.initialContent ?? undefined;
    const payload = logContent
      ? (extractFirstJsonObject(logContent) as BuildModelPayload | null)
      : null;
    logGenerationFallback("build_model", {
      hasContent: Boolean(logContent),
      repairAttempted: completion.repairAttempted,
      failureReason: completion.failureReason,
      payloadKeys: payload ? Object.keys(payload) : [],
      hotellingModelType: typeof payload?.hotellingModel,
      assistantMessageType: typeof payload?.assistantMessage,
      contentPreview: logContent?.slice(0, 500),
    });

    return fallback;
  }

  const {
    selectedDirectionId,
    refinedIdea,
    assetSummary: parsedAssetSummary,
  } = completion.value;
  const selectedDirection =
    findDirection(baseProject, selectedDirectionId ?? request.selectedDirectionId) ??
    findDirection(baseProject, request.selectedDirectionId) ??
    baseProject.researchSession?.directions.find((direction) => direction.recommended) ??
    baseProject.researchSession?.directions[0];
  const solvability = evaluateHotellingModelSolvability(
    completion.value.hotellingModel
  );
  const narrowedModel = solvability.ok
    ? completion.value.hotellingModel
    : createMinimalSolvableModelForDirection(
        selectedDirection,
        completion.value.hotellingModel
      );
  const hotellingModel = narrowedModel;
  const assistantMessage = solvability.ok
    ? completion.value.assistantMessage
    : createNarrowedModelAssistantMessage(
        completion.value.assistantMessage,
        solvability.issues
      );
  const previousSession = baseProject.researchSession;
  const userMessage = request.userMessage?.trim();
  const messages: ResearchSessionMessage[] = [
    ...(previousSession?.messages ?? []),
    ...(userMessage
      ? [
          {
            id: `msg-user-model-${Date.now()}`,
            role: "user" as const,
            content: userMessage,
            createdAt: 0,
          },
        ]
      : []),
    {
      id: `msg-assistant-model-${Date.now()}`,
      role: "assistant",
      content: assistantMessage,
      createdAt: 0,
    },
  ];
  const assetSummary =
    solvability.ok && parsedAssetSummary
      ? parsedAssetSummary
      : createModelAssetSummary(selectedDirection, hotellingModel);

  return {
    project: {
      ...baseProject,
      projectType: "formal",
      refinedIdea: refinedIdea ?? selectedDirection?.title ?? baseProject.refinedIdea,
      researchSession: {
        phase: "model",
        directions: previousSession?.directions ?? [],
        messages,
        assetSummary,
      },
      hotellingModel,
      equilibriumResult: createModelAwareEquilibriumScaffoldResult(
        hotellingModel,
        selectedDirection
      ),
    },
    usedFallback: false,
    assistantMessage,
  };
}

async function solveEquilibrium(
  request: ResearchGenerationRequest,
  client: ResearchCompletionClient
): Promise<ResearchGenerationResponse> {
  if (!request.project) {
    throw new Error("project is required for solve_equilibrium");
  }

  const fallbackProject = generateSymbolicEquilibrium(request.project);
  const prompt = createEquilibriumPrompt(request.project);
  const completion = await completeWithRepair(
    client,
    prompt,
    validateEquilibriumCompletion,
    {
      actionLabel: "solve_equilibrium",
      requiredShape: EQUILIBRIUM_REPAIR_SHAPE,
    }
  );

  if (completion.value) {
    return {
      project: attachEquilibriumResult(
        request.project,
        completion.value.equilibriumResult,
        completion.value.assistantMessage
      ),
      usedFallback: false,
      assistantMessage: completion.value.assistantMessage,
    };
  }

  const logContent = completion.content ?? completion.initialContent ?? undefined;
  if (logContent) {
    const payload = extractFirstJsonObject(logContent) as EquilibriumPayload | null;
    logGenerationFallback("solve_equilibrium", {
      hasContent: true,
      repairAttempted: completion.repairAttempted,
      failureReason: completion.failureReason,
      payloadKeys: payload ? Object.keys(payload) : [],
      equilibriumResultType: typeof payload?.equilibriumResult,
      assistantMessageType: typeof payload?.assistantMessage,
      contentPreview: logContent.slice(0, 500),
    });
  }

  return {
    project: fallbackProject,
    usedFallback: true,
    assistantMessage: fallbackProject.researchSession?.messages.at(-1)?.content ?? "",
  };
}

async function analyzeProperties(
  request: ResearchGenerationRequest,
  client: ResearchCompletionClient
): Promise<ResearchGenerationResponse> {
  if (!request.project) {
    throw new Error("project is required for analyze_properties");
  }

  const fallbackProject = generatePropertyAnalysis(request.project);
  const prompt = createPropertyAnalysisPrompt(request.project);
  const completion = await completeWithRepair(
    client,
    prompt,
    validatePropertyAnalysisCompletion,
    {
      actionLabel: "analyze_properties",
      requiredShape: PROPERTY_ANALYSIS_REPAIR_SHAPE,
    }
  );

  if (completion.value) {
    return {
      project: attachPropertyAnalyses(
        request.project,
        completion.value.analyses,
        completion.value.assistantMessage
      ),
      usedFallback: false,
      assistantMessage: completion.value.assistantMessage,
    };
  }

  const logContent = completion.content ?? completion.initialContent ?? undefined;
  if (logContent) {
    const payload = extractFirstJsonObject(logContent) as PropertyAnalysisPayload | null;
    logGenerationFallback("analyze_properties", {
      hasContent: true,
      repairAttempted: completion.repairAttempted,
      failureReason: completion.failureReason,
      payloadKeys: payload ? Object.keys(payload) : [],
      propertyAnalysisType: typeof payload?.propertyAnalysis,
      propertyAnalysesType: Array.isArray(payload?.propertyAnalyses)
        ? "array"
        : typeof payload?.propertyAnalyses,
      assistantMessageType: typeof payload?.assistantMessage,
      contentPreview: logContent.slice(0, 500),
    });
  }

  return {
    project: fallbackProject,
    usedFallback: true,
    assistantMessage: fallbackProject.researchSession?.messages.at(-1)?.content ?? "",
  };
}

async function tryComplete(
  client: ResearchCompletionClient,
  messages: LlmMessage[]
): Promise<string | null> {
  if (!client.complete) return null;

  try {
    return await client.complete(messages);
  } catch (error) {
    logGenerationFallback("provider_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function logGenerationFallback(
  action: string,
  detail: Record<string, unknown>
) {
  console.warn("Research generation used fallback", {
    action,
    ...detail,
  });
}

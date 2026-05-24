import { generateResearchProject } from "@/lib/ai-research-generation";
import type { ResearchGenerationRequest } from "@/lib/ai-research-generation";
import {
  completeProviderChat,
  getProviderConfigForModelSource,
  jsonError,
} from "@/lib/provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { getProviderTimeoutMs } from "@/lib/research-generation-timeout";
import { getRequestUserId } from "@/lib/server-auth";
import { normalizeModelSourceSettings } from "@/lib/model-source";

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

  let body: ResearchGenerationRequest;
  try {
    body = (await request.json()) as ResearchGenerationRequest;
  } catch {
    return jsonError("Invalid JSON body", 400, "invalid_json");
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return jsonError(validationError, 400, "invalid_research_generation_request");
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
  const apiKey = provider.apiKey;
  const timeoutMs = getProviderTimeoutMs(body.action);
  const result = await generateResearchProject(body, {
    complete: apiKey
      ? async (messages) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(),
            timeoutMs
          );

          try {
            return await completeProviderChat(
              {
                ...provider,
                apiKey,
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
        }
      : undefined,
  });

  return Response.json(result);
}

function validateRequest(body: ResearchGenerationRequest) {
  if (!body || typeof body !== "object") {
    return "Request body is required";
  }

  if (
    body.action !== "discover_directions" &&
    body.action !== "build_model" &&
    body.action !== "solve_equilibrium" &&
    body.action !== "analyze_properties" &&
    body.action !== "draft_paper" &&
    body.action !== "continue_conversation"
  ) {
    return "Invalid action";
  }

  if (typeof body.rawIdea !== "string" || body.rawIdea.trim().length === 0) {
    return "rawIdea is required";
  }

  if (
    body.selectedDirectionId !== undefined &&
    typeof body.selectedDirectionId !== "string"
  ) {
    return "selectedDirectionId must be a string";
  }

  if (body.userMessage !== undefined && typeof body.userMessage !== "string") {
    return "userMessage must be a string";
  }

  if (
    body.action === "build_model" &&
    body.project !== undefined &&
    !body.project.id
  ) {
    return "project must be a ResearchProject";
  }

  if (
    (body.action === "solve_equilibrium" ||
      body.action === "analyze_properties" ||
      body.action === "draft_paper" ||
      body.action === "continue_conversation") &&
    (!body.project || !body.project.id)
  ) {
    return "project is required";
  }

  if (
    body.action === "continue_conversation" &&
    (typeof body.userMessage !== "string" ||
      body.userMessage.trim().length === 0)
  ) {
    return "userMessage is required";
  }

  return null;
}

import type { AgentTaskInput, ModelSourceSettings } from "../types";

export function sanitizeAgentTaskInput(input: unknown): AgentTaskInput | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<AgentTaskInput>;

  if (
    typeof candidate.rawIdea !== "string" ||
    typeof candidate.projectId !== "string" ||
    !isSupportedTaskAction(candidate.action)
  ) {
    return null;
  }

  const sanitized: AgentTaskInput = {
    rawIdea: candidate.rawIdea,
    projectId: candidate.projectId,
    action: candidate.action,
  };

  if (typeof candidate.selectedDirectionId === "string") {
    sanitized.selectedDirectionId = candidate.selectedDirectionId;
  }
  if (typeof candidate.sectionId === "string") {
    sanitized.sectionId = candidate.sectionId;
  }
  if (typeof candidate.instruction === "string") {
    sanitized.instruction = candidate.instruction;
  }
  if (
    candidate.resume &&
    typeof candidate.resume === "object" &&
    typeof candidate.resume.runId === "string"
  ) {
    sanitized.resume = {
      runId: candidate.resume.runId,
      checkpointId:
        typeof candidate.resume.checkpointId === "string"
          ? candidate.resume.checkpointId
          : undefined,
    };
  }

  return sanitized;
}

export function isSupportedTaskAction(
  action: unknown
): action is AgentTaskInput["action"] {
  return (
    action === "build_model" ||
    action === "solve_equilibrium" ||
    action === "analyze_properties" ||
    action === "draft_paper" ||
    action === "revise_paper_section"
  );
}

export function sanitizeRuntimeModelSource(
  input: unknown
): ModelSourceSettings | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Partial<ModelSourceSettings>;

  if (candidate.source === "paperforge") {
    return { source: "paperforge" };
  }

  if (
    candidate.source === "own" &&
    (candidate.provider === "openai" ||
      candidate.provider === "openai-compatible") &&
    typeof candidate.apiKey === "string" &&
    candidate.apiKey.trim() &&
    typeof candidate.model === "string" &&
    candidate.model.trim()
  ) {
    return {
      source: "own",
      provider: candidate.provider,
      apiKey: candidate.apiKey,
      model: candidate.model,
      ...(typeof candidate.baseUrl === "string" && candidate.baseUrl.trim()
        ? { baseUrl: candidate.baseUrl }
        : {}),
    };
  }

  return undefined;
}

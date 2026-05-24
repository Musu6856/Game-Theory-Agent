import type { GameTheoryModel } from "./types";
import type {
  ModelSourceMetadata,
  ModelSourceSettings,
  ResearchProject,
} from "./types";
import type { AgentResumeRequest } from "./research-agent/resume";

const BASE_URL = "/api";

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function chatStream(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  onChunk: (text: string) => void
): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No reader available");

  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    full += text;
    onChunk(full);
  }

  return full;
}

export async function generateFromPrompt(prompt: string): Promise<string> {
  return chatStream([{ role: "user", content: prompt }], () => {});
}

export async function fetchLiterature(
  model: GameTheoryModel
): Promise<string> {
  const res = await fetch(`${BASE_URL}/literature`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const data = await res.json();
  return data.content;
}

export async function fetchProjects(): Promise<ResearchProject[]> {
  const data = await readJson<{ projects: ResearchProject[] }>(
    await fetch(`${BASE_URL}/projects`)
  );

  return data.projects;
}

export async function fetchProject(id: string): Promise<ResearchProject> {
  const data = await readJson<{ project: ResearchProject }>(
    await fetch(`${BASE_URL}/projects/${id}`)
  );

  return data.project;
}

export async function createProject(
  project: ResearchProject
): Promise<ResearchProject> {
  const data = await readJson<{ project: ResearchProject }>(
    await fetch(`${BASE_URL}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project }),
    })
  );

  return data.project;
}

export async function createExplorationProjectApi(
  project: ResearchProject
): Promise<ResearchProject> {
  return createProject(project);
}

export type GenerateResearchProjectPayload =
  | {
      action: "discover_directions";
      rawIdea: string;
      modelSource?: ModelSourceMetadata;
      runtimeModelSource?: ModelSourceSettings;
      useOnlineEvidence?: boolean;
    }
  | {
      action: "build_model";
      rawIdea: string;
      selectedDirectionId: string;
      userMessage?: string;
      project: ResearchProject;
      runtimeModelSource?: ModelSourceSettings;
      resume?: AgentResumeRequest;
    }
  | {
      action: "solve_equilibrium";
      rawIdea: string;
      project: ResearchProject;
      runtimeModelSource?: ModelSourceSettings;
      resume?: AgentResumeRequest;
    }
  | {
      action: "analyze_properties";
      rawIdea: string;
      project: ResearchProject;
      runtimeModelSource?: ModelSourceSettings;
      resume?: AgentResumeRequest;
    }
  | {
      action: "draft_paper";
      rawIdea: string;
      project: ResearchProject;
      runtimeModelSource?: ModelSourceSettings;
      resume?: AgentResumeRequest;
    }
  | {
      action: "continue_conversation";
      rawIdea: string;
      userMessage: string;
      project: ResearchProject;
      runtimeModelSource?: ModelSourceSettings;
    };

export interface GenerateResearchProjectResult {
  project: ResearchProject;
  usedFallback?: boolean;
  assistantMessage?: string;
  assetPatch?: {
    kind: "update_model" | "update_equilibrium" | "update_properties";
    summary: string;
    changes: Array<{
      target: string;
      op: "set" | "insert" | "remove";
      value?: unknown;
      reason?: string;
    }>;
  };
}

export async function generateResearchProjectApi(
  payload: GenerateResearchProjectPayload
): Promise<GenerateResearchProjectResult> {
  if (
    payload.action === "discover_directions" ||
    payload.action === "build_model" ||
    payload.action === "solve_equilibrium" ||
    payload.action === "analyze_properties" ||
    payload.action === "draft_paper"
  ) {
    return readJson<GenerateResearchProjectResult>(
      await fetch(`${BASE_URL}/research/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  }

  return readJson<GenerateResearchProjectResult>(
    await fetch(`${BASE_URL}/research/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export interface ProviderHealthResult {
  ok: boolean;
  configured: boolean;
  code:
    | "connected"
    | "missing_api_key"
    | "unsupported_provider"
    | "upstream_http_error"
    | "invalid_response"
    | "network_error";
  message: string;
  provider: {
    baseUrl: string;
    model: string;
  };
  latencyMs?: number;
  statusCode?: number;
  checks?: {
    chat: ProviderHealthResult;
    json: ProviderHealthResult | null;
  };
}

export interface TavilyMcpHealthResult {
  ok: boolean;
  configured: boolean;
  code:
    | "connected"
    | "missing_mcp_url"
    | "invalid_mcp_url"
    | "missing_search_tool"
    | "connection_failed";
  message: string;
  endpoint: string;
  tools: string[];
  hasSearchTool: boolean;
  latencyMs?: number;
}

export async function checkProviderHealth(
  modelSource?: ModelSourceSettings
): Promise<ProviderHealthResult> {
  return readJson<ProviderHealthResult>(
    await fetch(`${BASE_URL}/provider/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelSource }),
    })
  );
}

export async function checkTavilyMcpHealthApi(): Promise<TavilyMcpHealthResult> {
  return readJson<TavilyMcpHealthResult>(
    await fetch(`${BASE_URL}/research/mcp/health`)
  );
}

export async function saveProject(
  project: ResearchProject
): Promise<ResearchProject> {
  const data = await readJson<{ project: ResearchProject }>(
    await fetch(`${BASE_URL}/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project }),
    })
  );

  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  await readJson<{ ok: true }>(
    await fetch(`${BASE_URL}/projects/${id}`, {
      method: "DELETE",
    })
  );
}

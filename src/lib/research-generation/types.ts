import type {
  ModelSourceMetadata,
  ModelSourceSettings,
  ResearchProject,
} from "../types";

export type ResearchGenerationAction =
  | "discover_directions"
  | "build_model"
  | "solve_equilibrium"
  | "analyze_properties"
  | "draft_paper"
  | "continue_conversation";

export type ResearchGenerationRequest = {
  action: ResearchGenerationAction;
  rawIdea: string;
  selectedDirectionId?: string;
  userMessage?: string;
  modelSource?: ModelSourceMetadata;
  runtimeModelSource?: ModelSourceSettings;
  project?: ResearchProject;
};

export type ResearchGenerationResponse = {
  project: ResearchProject;
  usedFallback: boolean;
  assistantMessage: string;
  assetPatch?: ResearchAssetPatch;
};

export type ResearchAssetPatch = {
  kind: "update_model" | "update_equilibrium" | "update_properties";
  summary: string;
  changes: ResearchAssetPatchChange[];
};

export type ResearchAssetPatchChange = {
  target: string;
  op: "set" | "insert" | "remove";
  value?: JsonValue;
  reason?: string;
};

export type ResearchCompletionClient = {
  complete?: (messages: LlmMessage[]) => Promise<string>;
  now?: number;
  id?: string;
};

export type LlmMessage = {
  role: "developer" | "system" | "user";
  content: string;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

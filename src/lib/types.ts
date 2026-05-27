export interface Player {
  name: string;
  description: string;
  objective: string;
}

export interface Strategy {
  player: string;
  options: string[];
}

export interface PayoffStructure {
  description: string;
  type: "matrix" | "function" | "general";
}

export interface PlatformContext {
  hasCrossNetworkEffects: boolean;
  sides: string[];
  pricingModel?: "subscription" | "transaction" | "freemium" | "ad-supported";
}

export interface GameTheoryModel {
  title: string;
  gameType:
    | "simultaneous"
    | "sequential"
    | "repeated"
    | "bargaining"
    | "signaling";
  players: Player[];
  strategies: Strategy[];
  payoffs: PayoffStructure;
  platformContext?: PlatformContext;
  keyAssumptions: string[];
}

export interface Reference {
  title: string;
  authors: string;
  year: number;
  relevance: string;
  category: "foundational" | "two-sided" | "methodology";
}

export interface PaperSection {
  id: string;
  title: string;
  content: string;
  status: "draft" | "generated" | "edited";
}

export interface BackgroundStory {
  scenario: string;
  puzzle: string;
  strategicInteraction: string;
  hotellingRationale: string;
  mechanismIntuition: string;
  contributionCandidates: string[];
  draft: string;
}

export interface LiteratureAnalysis {
  id: string;
  title: string;
  sourceText: string;
  researchQuestion: string;
  modelStructure: string;
  timing: string;
  utilityDesign: string;
  equilibriumMethod: string;
  borrowableIdeas: string[];
  differentiationPoints: string[];
}

export type SymbolRole =
  | "parameter"
  | "decision"
  | "demand"
  | "utility"
  | "cost"
  | "derived";

export type SymbolSide =
  | "platform"
  | "consumer"
  | "merchant"
  | "both"
  | "global";

export interface SymbolDefinition {
  id: string;
  symbol: string;
  baseSymbol: string;
  subscript?: string;
  superscript?: string;
  codeName: string;
  name: string;
  meaning: string;
  role: SymbolRole;
  side: SymbolSide;
  assumption: string;
  recommended: boolean;
}

export interface ModelStage {
  id: string;
  order: number;
  name: string;
  decisions: string[];
}

export interface UtilityFunction {
  id: string;
  side: "consumer" | "merchant";
  platform: string;
  expression: string;
  notes: string;
}

export interface ProfitFunction {
  id: string;
  platform: string;
  expression: string;
  notes: string;
}

export interface HotellingModel {
  symbols: SymbolDefinition[];
  sides: {
    consumerSideName: string;
    merchantSideName: string;
  };
  platforms: string[];
  timing: ModelStage[];
  utilityFunctions: UtilityFunction[];
  demandDerivation: string;
  profitFunctions: ProfitFunction[];
  assumptions: string[];
  modelSetupDraft: string;
}

export interface EquilibriumResult {
  status:
    | "idle"
    | "solved"
    | "needs_revision"
    | "derivation_draft"
    | "implicit_system"
    | "reaction_functions"
    | "failed_with_reason"
    | "needs_model_clarification"
    | "symbolic_failure";
  concept: string;
  solvingSteps: string[];
  focs: string[];
  conditions: string[];
  closedForm: string;
  derivation: string;
  code: string;
  warnings: string[];
  solverScratchpad?: EquilibriumSolverScratchpad;
}

export interface EquilibriumSolverScratchpad {
  status?:
    | "derivation_draft"
    | "implicit_system"
    | "reaction_functions"
    | "failed_with_reason"
    | "needs_model_clarification"
    | "symbolic_failure";
  implicitSystem?: string[];
  reactionFunctions?: string[];
  failedWithReason?: string;
  needsModelClarification?: string[];
  attemptedSteps?: string[];
}

export interface PropertyAnalysis {
  id: string;
  target: string;
  parameter: string;
  operation: "differentiate" | "compare" | "threshold" | "custom";
  symbolicResult: string;
  signCondition: string;
  propositionDraft: string;
  proofSketch: string;
  intuition: string;
  warnings: string[];
}

export type ModelSourceProvider =
  | "openai"
  | "openai-compatible";

export type ModelSourceSettings =
  | {
      source: "paperforge";
    }
  | {
      source: "own";
      provider: ModelSourceProvider;
      apiKey: string;
      model: string;
      baseUrl?: string;
    };

export type ModelSourceMetadata =
  | {
      source: "paperforge";
    }
  | {
      source: "own";
      provider: ModelSourceProvider;
      model: string;
      hasBrowserApiKey: boolean;
      baseUrl?: string;
    };

export type ResearchProjectType = "exploration" | "formal" | "legacy";

export interface ResearchDirection {
  id: string;
  title: string;
  summary: string;
  model: string;
  contribution: string;
  recommended: boolean;
  evidenceSourceIds?: string[];
  evidenceNote?: string;
}

export interface ResearchSessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export type ResearchAssetKind = "model" | "equilibrium" | "properties" | "paper";

export type ResearchAssetChangeKind = "replace" | "append" | "remove";

export type ResearchAssetPatchStatus = "proposed" | "applied" | "rejected";

export type ResearchAssetFreshness = "fresh" | "stale";

export interface ResearchAssetFreshnessMap {
  model: ResearchAssetFreshness;
  equilibrium: ResearchAssetFreshness;
  properties: ResearchAssetFreshness;
}

export interface ResearchAssetChange {
  kind: ResearchAssetChangeKind;
  path: string;
  value?: unknown;
  previousValue?: unknown;
  note?: string;
}

export interface ResearchAssetPatch {
  id: string;
  kind: ResearchAssetKind;
  summary: string;
  changes: ResearchAssetChange[];
  status: ResearchAssetPatchStatus;
  createdAt: number;
  sourceMessageId?: string;
  appliedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
}

export interface ResearchAssetVersionEvent {
  id: string;
  assetKind: ResearchAssetKind;
  action: "applied_patch" | "rejected_patch";
  patchId: string;
  summary: string;
  changedPaths: string[];
  changes: ResearchAssetChange[];
  changeCount: number;
  createdAt: number;
  approvedBy?: "user";
  sourceMessageId?: string;
  note?: string;
  rejectionReason?: string;
  nextRecommendation?: string;
  impact?: ResearchAssetVersionImpact;
}

export interface ResearchAssetVersionImpact {
  summary: string;
  affectedAssetKinds: ResearchAssetKind[];
  reviewFocus: string[];
  nextAction: string;
}

export interface ResearchAssetPatchInput {
  id?: string;
  kind: ResearchAssetKind;
  summary: string;
  changes: ResearchAssetChange[];
  createdAt?: number;
  sourceMessageId?: string;
}

export interface ResearchSessionDecision {
  kind:
    | "choose_direction"
    | "answer_model_question"
    | "solve_equilibrium"
    | "analyze_properties"
    | "draft_paper"
    | "revise_paper_section";
  prompt: string;
}

export type ResearchSessionEquilibriumStatus =
  | "not_started"
  | "等待模型确认"
  | "等待开始求解"
  | "待推导解析解"
  | EquilibriumResult["status"];

export interface ResearchSessionAssetSummary {
  currentDirection?: ResearchDirection;
  confirmedAssumptions: string[];
  pendingDecision?: ResearchSessionDecision;
  utilityFunctions: string[];
  equilibriumStatus: ResearchSessionEquilibriumStatus;
  nextActions: string[];
}

export type ResearchMathVerificationCheck = {
  kind:
    | "symbol_grounding"
    | "calculus_recheck"
    | "sign_condition"
    | "sympy_execution";
  status:
    | "passed"
    | "failed"
    | "condition_insufficient"
    | "unsupported"
    | "manual_review";
  message: string;
  analysisId?: string;
  analysisIndex?: number;
};

export type ResearchMathArtifactKind =
  | "equilibrium_candidate"
  | "compiled_game_system"
  | "closed_form_substitutions"
  | "foc_residuals"
  | "generated_foc_system"
  | "model_profit_foc"
  | "solver_attempt"
  | "sympy_residual_check"
  | "sympy_solve_check";

export interface ResearchMathArtifact {
  id: string;
  runId?: string;
  stepId: string;
  patchId?: string;
  kind: ResearchMathArtifactKind;
  title: string;
  status: ResearchMathVerificationCheck["status"];
  source: "candidate" | "model" | "sympy";
  input?: unknown;
  output?: unknown;
  issues?: string[];
  createdAt: number;
}

export interface ResearchSession {
  phase: "direction" | "model" | "equilibrium" | "analysis" | "paper";
  directions: ResearchDirection[];
  messages: ResearchSessionMessage[];
  assetSummary: ResearchSessionAssetSummary;
  evidencePack?: EvidencePack;
  agentRun?: AgentRun;
  agentRunHistory?: AgentRun[];
  assetVersionHistory?: ResearchAssetVersionEvent[];
  assetFreshness?: ResearchAssetFreshnessMap;
  assetPatches?: ResearchAssetPatch[];
  mathVerificationChecks?: ResearchMathVerificationCheck[];
  mathArtifacts?: ResearchMathArtifact[];
}

export type AgentRunStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export type AgentRunAction =
  | "discover_directions"
  | "build_model"
  | "solve_equilibrium"
  | "analyze_properties"
  | "draft_paper"
  | "revise_paper_section"
  | "safe_continue"
  | "confirm_model";

export type AgentTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentTaskCheckpoint {
  id: string;
  stepId: string;
  title: string;
  status: AgentStep["status"];
  toolName?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface AgentTaskInput {
  rawIdea: string;
  action: AgentRunAction;
  projectId: string;
  selectedDirectionId?: string;
  sectionId?: string;
  instruction?: string;
  resume?: {
    runId: string;
    checkpointId?: string;
  };
  runtimeModelSource?: ModelSourceSettings;
}

export interface AgentTaskResult {
  projectId: string;
  runId?: string;
  patchIds?: string[];
  mathArtifactIds?: string[];
}

export interface AgentTask {
  id: string;
  ownerId: string;
  projectId: string;
  action: AgentRunAction;
  status: AgentTaskStatus;
  input: AgentTaskInput | Record<string, unknown>;
  checkpoints: AgentTaskCheckpoint[];
  workerId?: string;
  leaseUntil?: number;
  result?: AgentTaskResult | unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  failedAt?: number;
}

export interface AgentRun {
  id: string;
  projectId?: string;
  action?: AgentRunAction;
  goal: string;
  status: AgentRunStatus;
  plan: AgentStep[];
  currentStepId?: string;
  checkpoints?: AgentCheckpoint[];
  trace: AgentTraceEvent[];
  pauseReason?: string;
  requiresApproval?: boolean;
  startedAt: number;
  completedAt?: number;
}

export interface AgentStep {
  id: string;
  kind: "tool" | "approval" | "reflection";
  toolName?: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
}

export interface AgentCheckpoint {
  id: string;
  runId: string;
  stepId: string;
  title: string;
  status: AgentStep["status"];
  toolName?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface AgentTraceEvent {
  id: string;
  runId: string;
  stepId?: string;
  type:
    | "plan_created"
    | "tool_call"
    | "tool_result"
    | "model_call"
    | "model_result"
    | "fallback"
    | "error";
  message: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export type EvidenceSourceType = "web" | "paper" | "policy" | "industry";

export interface EvidencePack {
  query: string;
  createdAt: number;
  sources: EvidenceSource[];
  summary: string;
}

export interface EvidenceSource {
  id: string;
  title: string;
  url: string;
  sourceType: EvidenceSourceType;
  publishedAt?: string;
  retrievedAt: number;
  snippet: string;
  summary: string;
  relevance: string;
}

export interface ResearchProject {
  id: string;
  createdAt: number;
  rawIdea: string;
  refinedIdea: string;
  projectType?: ResearchProjectType;
  model: GameTheoryModel | null;
  wizardCompleted: boolean;
  sections: PaperSection[];
  references: Reference[];
  modelSource?: ModelSourceMetadata;
  researchSession?: ResearchSession;
  background?: BackgroundStory;
  literatureAnalyses?: LiteratureAnalysis[];
  hotellingModel?: HotellingModel;
  equilibriumResult?: EquilibriumResult;
  propertyAnalyses?: PropertyAnalysis[];
}

export type WizardStep =
  | "players"
  | "strategies"
  | "payoffs"
  | "gameType"
  | "platform"
  | "review";

export type ResearchGenerationAction =
  | "discover_directions"
  | "build_model"
  | "solve_equilibrium"
  | "analyze_properties"
  | "draft_paper"
  | "revise_paper_section"
  | "continue_conversation";

const PROVIDER_TIMEOUT_MS = 45000;
const SYMBOLIC_PROVIDER_TIMEOUT_MS = 45000;

export function getProviderTimeoutMs(action: ResearchGenerationAction) {
  return action === "solve_equilibrium" || action === "analyze_properties"
    ? SYMBOLIC_PROVIDER_TIMEOUT_MS
    : PROVIDER_TIMEOUT_MS;
}

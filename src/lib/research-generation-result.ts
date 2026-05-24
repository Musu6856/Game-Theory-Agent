import type { GenerateResearchProjectResult } from "./api";
import type { ResearchProject } from "./types";

export function getPersistableResearchProject(
  result: GenerateResearchProjectResult
): ResearchProject | null {
  if (result.usedFallback && !hasPersistableFallbackAsset(result.project)) {
    return null;
  }

  return result.project;
}

function hasPersistableFallbackAsset(project: ResearchProject) {
  const phase = project.researchSession?.phase;
  const equilibriumStatus = project.equilibriumResult?.status;
  const hasPropertyAnalyses = Boolean(project.propertyAnalyses?.length);
  const hasProposedPatch = Boolean(
    project.researchSession?.assetPatches?.some(
      (patch) => patch.status === "proposed"
    )
  );

  if (hasProposedPatch) return true;

  if (phase === "equilibrium") return equilibriumStatus === "solved";
  if (hasPropertyAnalyses) return phase === "analysis";
  return false;
}

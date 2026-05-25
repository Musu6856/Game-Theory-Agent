import type { AgentStep } from "./state";

export function createDirectionDiscoveryPlan(): AgentStep[] {
  return [
    {
      id: "search-literature",
      kind: "tool",
      toolName: "literature.search",
      title: "Search open scholarly metadata",
      status: "pending",
    },
    {
      id: "search-web",
      kind: "tool",
      toolName: "web.search",
      title: "Search public web context",
      status: "pending",
    },
    {
      id: "build-evidence-pack",
      kind: "tool",
      toolName: "evidence.pack",
      title: "Build concise evidence pack",
      status: "pending",
    },
    {
      id: "discover-directions",
      kind: "reflection",
      title: "Generate evidence-backed directions",
      status: "pending",
    },
  ];
}

export function createModelGenerationPlan(): AgentStep[] {
  return [
    {
      id: "adopt-direction",
      kind: "reflection",
      title: "Adopt selected direction",
      status: "pending",
    },
    {
      id: "draft-model",
      kind: "tool",
      toolName: "research.buildModel",
      title: "Draft model candidate",
      status: "pending",
    },
    {
      id: "review-model",
      kind: "reflection",
      title: "Review model solvability and scope",
      status: "pending",
    },
    {
      id: "propose-model-patch",
      kind: "approval",
      toolName: "asset.proposePatch",
      title: "Propose reviewable model patch",
      status: "pending",
    },
  ];
}

export function createEquilibriumSolvingPlan(): AgentStep[] {
  return [
    {
      id: "prepare-equilibrium",
      kind: "reflection",
      title: "Prepare equilibrium target",
      status: "pending",
    },
    {
      id: "draft-equilibrium",
      kind: "tool",
      toolName: "research.solveEquilibrium",
      title: "Draft symbolic equilibrium candidate",
      status: "pending",
    },
    {
      id: "review-equilibrium",
      kind: "reflection",
      title: "Review equilibrium derivation quality",
      status: "pending",
    },
    {
      id: "propose-equilibrium-patch",
      kind: "approval",
      toolName: "asset.proposePatch",
      title: "Propose reviewable equilibrium patch",
      status: "pending",
    },
  ];
}

export function createPropertyAnalysisPlan(): AgentStep[] {
  return [
    {
      id: "prepare-properties",
      kind: "reflection",
      title: "Prepare property analysis targets",
      status: "pending",
    },
    {
      id: "draft-properties",
      kind: "tool",
      toolName: "research.analyzeProperties",
      title: "Draft symbolic property analysis candidates",
      status: "pending",
    },
    {
      id: "review-properties",
      kind: "reflection",
      title: "Review proposition and condition quality",
      status: "pending",
    },
    {
      id: "propose-properties-patch",
      kind: "approval",
      toolName: "asset.proposePatch",
      title: "Propose reviewable property analysis patch",
      status: "pending",
    },
  ];
}

export function createPaperOutputPlan(): AgentStep[] {
  return [
    {
      id: "prepare-paper-assets",
      kind: "reflection",
      title: "Prepare stable research assets",
      status: "pending",
    },
    {
      id: "draft-paper-sections",
      kind: "tool",
      toolName: "paper.draftSections",
      title: "Draft paper sections from applied assets",
      status: "pending",
    },
    {
      id: "review-paper-grounding",
      kind: "reflection",
      title: "Review section grounding and gaps",
      status: "pending",
    },
    {
      id: "propose-paper-patch",
      kind: "approval",
      toolName: "asset.proposePatch",
      title: "Propose reviewable paper draft patch",
      status: "pending",
    },
  ];
}

export function createPaperSectionRevisionPlan(): AgentStep[] {
  return [
    {
      id: "select-paper-section",
      kind: "reflection",
      title: "Select target paper section",
      status: "pending",
    },
    {
      id: "draft-paper-section",
      kind: "tool",
      toolName: "paper.reviseSection",
      title: "Draft a section-level revision",
      status: "pending",
    },
    {
      id: "review-section-grounding",
      kind: "reflection",
      title: "Review section grounding and dependencies",
      status: "pending",
    },
    {
      id: "propose-section-patch",
      kind: "approval",
      toolName: "asset.proposePatch",
      title: "Propose reviewable section patch",
      status: "pending",
    },
  ];
}

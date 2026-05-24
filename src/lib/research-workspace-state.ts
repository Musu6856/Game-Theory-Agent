type ResearchWorkspaceViewStateInput = {
  projectId?: string | null;
  startComposingNewConversation?: boolean;
  localComposingProjectId?: string | null;
};

export const COMPOSING_SIDEBAR_PROJECT_ID = "local-composing-sidebar";

export function getResearchWorkspaceViewState({
  projectId,
  startComposingNewConversation = false,
  localComposingProjectId = null,
}: ResearchWorkspaceViewStateInput) {
  return {
    isComposingNewConversation:
      !projectId ||
      startComposingNewConversation ||
      localComposingProjectId === projectId,
  };
}

export function createComposingSidebarProject(now = 0) {
  return {
    id: COMPOSING_SIDEBAR_PROJECT_ID,
    createdAt: now,
    rawIdea: "",
    refinedIdea: "新的研究对话",
    projectType: "exploration" as const,
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
  };
}

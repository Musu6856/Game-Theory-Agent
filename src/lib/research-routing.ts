type ResearchIndexProject = {
  id: string;
};

type ResearchIndexOptions = {
  composeNew?: boolean;
  deletingProjectId?: string | null;
};

export function getResearchIndexDestination(
  projects: ResearchIndexProject[],
  options: ResearchIndexOptions = {}
): string | null {
  if (options.composeNew) {
    return null;
  }

  const firstProject = projects[0];
  return firstProject ? `/research/${firstProject.id}` : null;
}

export function getResearchIndexWorkspaceProject<T extends ResearchIndexProject>(
  projects: T[],
  options: ResearchIndexOptions = {}
): T | null {
  if (!options.composeNew) {
    return projects[0] ?? null;
  }

  const deletingProjectId = options.deletingProjectId;
  return (
    projects.find((project) => project.id !== deletingProjectId) ??
    null
  );
}

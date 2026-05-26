import type { ResearchProject } from "../types";

export async function hasAgentTaskProjectAccess({
  ownerId,
  projectId,
  getProject,
}: {
  ownerId: string;
  projectId: string;
  getProject: (input: {
    ownerId: string;
    projectId: string;
  }) => Promise<Pick<ResearchProject, "id"> | null>;
}) {
  const project = await getProject({ ownerId, projectId });
  return Boolean(project);
}

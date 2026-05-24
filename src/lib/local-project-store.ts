import type { ResearchProject } from "./types";

const localProjectsByOwner = new Map<string, ResearchProject[]>();

export function shouldUseLocalProjectStore() {
  return process.env.NODE_ENV === "development" && !process.env.DATABASE_URL;
}

export function listLocalProjects(ownerId: string) {
  return [...(localProjectsByOwner.get(ownerId) ?? [])].sort(
    (left, right) => right.createdAt - left.createdAt
  );
}

export function upsertLocalProject(ownerId: string, project: ResearchProject) {
  const current = localProjectsByOwner.get(ownerId) ?? [];
  const index = current.findIndex((item) => item.id === project.id);
  const next =
    index === -1
      ? [project, ...current]
      : current.map((item) => (item.id === project.id ? project : item));

  localProjectsByOwner.set(ownerId, next);
  return project;
}

export function getLocalProject(ownerId: string, projectId: string) {
  return (
    localProjectsByOwner
      .get(ownerId)
      ?.find((project) => project.id === projectId) ?? null
  );
}

export function deleteLocalProject(ownerId: string, projectId: string) {
  const current = localProjectsByOwner.get(ownerId) ?? [];
  const next = current.filter((project) => project.id !== projectId);
  localProjectsByOwner.set(ownerId, next);
  return next.length !== current.length;
}

export function clearLocalProjectStore() {
  localProjectsByOwner.clear();
}

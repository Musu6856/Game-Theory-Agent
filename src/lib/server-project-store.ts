import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import {
  getLocalProject,
  shouldUseLocalProjectStore,
  upsertLocalProject,
} from "./local-project-store.ts";
import { projectFromRow } from "./project-records.ts";
import type { ResearchProject } from "./types";

export async function getProjectForOwner({
  ownerId,
  projectId,
}: {
  ownerId: string;
  projectId: string;
}) {
  if (shouldUseLocalProjectStore()) {
    return getLocalProject(ownerId, projectId);
  }

  const [row] = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);

  return row ? projectFromRow(row) : null;
}

export async function saveProjectForOwner({
  ownerId,
  project,
}: {
  ownerId: string;
  project: ResearchProject;
}) {
  if (shouldUseLocalProjectStore()) {
    return upsertLocalProject(ownerId, project);
  }

  const [row] = await getDb()
    .update(projects)
    .set({
      rawIdea: project.rawIdea,
      refinedIdea: project.refinedIdea,
      projectType: project.projectType ?? "legacy",
      model: project.model,
      researchSession: project.researchSession ?? null,
      modelSource: project.modelSource ?? null,
      wizardCompleted: project.wizardCompleted,
      sections: project.sections,
      references: project.references,
      background: project.background ?? null,
      literatureAnalyses: project.literatureAnalyses ?? [],
      hotellingModel: project.hotellingModel ?? null,
      equilibriumResult: project.equilibriumResult ?? null,
      propertyAnalyses: project.propertyAnalyses ?? [],
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, project.id), eq(projects.ownerId, ownerId)))
    .returning();

  if (!row) throw new Error("Project not found");
  return projectFromRow(row);
}

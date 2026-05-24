import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import {
  deleteLocalProject,
  getLocalProject,
  shouldUseLocalProjectStore,
  upsertLocalProject,
} from "@/lib/local-project-store";
import { projectFromRow, sanitizeProjectPayload } from "@/lib/project-records";
import { getRequestUserId } from "@/lib/server-auth";

function jsonError(error: string, status: number, code: string) {
  return Response.json({ error, code }, { status });
}

type ProjectRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ProjectRouteContext) {
  try {
    const userId = await getRequestUserId();
    if (!userId) return jsonError("Unauthorized", 401, "unauthorized");

    const { id } = await context.params;

    if (shouldUseLocalProjectStore()) {
      const project = getLocalProject(userId, id);
      if (!project) return jsonError("Project not found", 404, "project_not_found");
      return Response.json({ project });
    }

    const [row] = await getDb()
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
      .limit(1);

    if (!row) return jsonError("Project not found", 404, "project_not_found");

    return Response.json({ project: projectFromRow(row) });
  } catch (error) {
    console.error("Project API error:", error);
    return jsonError("Internal server error", 500, "internal_error");
  }
}

export async function PATCH(request: Request, context: ProjectRouteContext) {
  try {
    const userId = await getRequestUserId();
    if (!userId) return jsonError("Unauthorized", 401, "unauthorized");

    const { id } = await context.params;
    const body = await request.json();
    const project = sanitizeProjectPayload(body.project);
    if (!project || project.id !== id) {
      return jsonError("Invalid project data", 400, "invalid_project");
    }

    if (shouldUseLocalProjectStore()) {
      if (!getLocalProject(userId, id)) {
        return jsonError("Project not found", 404, "project_not_found");
      }
      return Response.json({ project: upsertLocalProject(userId, project) });
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
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
      .returning();

    if (!row) return jsonError("Project not found", 404, "project_not_found");

    return Response.json({ project: projectFromRow(row) });
  } catch (error) {
    console.error("Update project error:", error);
    return jsonError("Internal server error", 500, "internal_error");
  }
}

export async function DELETE(_request: Request, context: ProjectRouteContext) {
  try {
    const userId = await getRequestUserId();
    if (!userId) return jsonError("Unauthorized", 401, "unauthorized");

    const { id } = await context.params;

    if (shouldUseLocalProjectStore()) {
      if (!deleteLocalProject(userId, id)) {
        return jsonError("Project not found", 404, "project_not_found");
      }
      return Response.json({ ok: true });
    }

    const [row] = await getDb()
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
      .returning({ id: projects.id });

    if (!row) return jsonError("Project not found", 404, "project_not_found");

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Delete project error:", error);
    return jsonError("Internal server error", 500, "internal_error");
  }
}

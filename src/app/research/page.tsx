"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ResearchWorkspace } from "@/components/research-workspace/research-workspace";
import {
  getResearchIndexDestination,
  getResearchIndexWorkspaceProject,
} from "@/lib/research-routing";
import { useStore } from "@/lib/store";

const DELETING_PROJECT_SESSION_KEY = "paperforge-deleting-project-id";

export default function ResearchIndexPage() {
  return (
    <Suspense fallback={<ResearchWorkspaceLoading />}>
      <ResearchIndexContent />
    </Suspense>
  );
}

function ResearchIndexContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state } = useStore();
  const composeNew = searchParams.get("new") === "1";
  const deletingProjectId =
    typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(DELETING_PROJECT_SESSION_KEY);
  const workspaceProject = getResearchIndexWorkspaceProject(state.projects, {
    composeNew,
    deletingProjectId,
  });

  useEffect(() => {
    if (state.isLoading) return;

    const destination = getResearchIndexDestination(state.projects, {
      composeNew,
    });
    if (destination) {
      router.replace(destination);
    }
  }, [composeNew, router, state.isLoading, state.projects]);

  if (!state.isLoading && (composeNew || state.projects.length === 0)) {
    return (
      <ResearchWorkspace
        key={`${workspaceProject?.id ?? "empty"}:${composeNew ? "new" : "view"}`}
        project={workspaceProject ?? undefined}
        startComposingNewConversation
      />
    );
  }

  return <ResearchWorkspaceLoading />;
}

function ResearchWorkspaceLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
      正在进入研究工作台
    </main>
  );
}

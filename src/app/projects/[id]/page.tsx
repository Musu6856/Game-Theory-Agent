"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { HotellingWorkbench } from "@/components/hotelling-workbench/workbench";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProject } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { state, dispatch } = useStore();
  const [loadError, setLoadError] = useState(false);

  const requestedId = params.id as string;
  const project =
    state.currentProject?.id === requestedId ? state.currentProject : null;

  useEffect(() => {
    if (project) return;

    let cancelled = false;

    async function loadProject() {
      setLoadError(false);
      try {
        const found = await fetchProject(requestedId);
        if (!cancelled) {
          dispatch({ type: "SET_PROJECT", payload: found });
        }
      } catch (e) {
        console.error("Failed to load project", e);
        if (!cancelled) {
          setLoadError(true);
        }
        toast.error("项目加载失败");
      }
    }

    loadProject();

    return () => {
      cancelled = true;
    };
  }, [requestedId, project, dispatch]);

  if (!project) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="border-b bg-background/90">
          <div className="mx-auto max-w-[1500px] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/")}
                className="shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">加载项目</p>
                <p className="text-xs text-muted-foreground">
                  正在恢复你的论文工作台
                </p>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-4 sm:px-5">
          {loadError ? (
            <Card className="mx-auto mt-10 max-w-lg border-destructive/20 bg-card shadow-sm">
              <CardContent className="flex flex-col items-center px-6 py-10 text-center">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <h1 className="text-base font-semibold">项目加载失败</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  当前项目没有成功恢复。你可以返回首页重新打开，或稍后再试。
                </p>
                <div className="mt-5 flex gap-2">
                  <Button variant="outline" onClick={() => router.push("/")}>
                    返回首页
                  </Button>
                  <Button onClick={() => window.location.reload()}>
                    重新加载
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="animate-pulse space-y-4">
              <div className="h-24 rounded-lg bg-muted" />
              <div className="h-[640px] rounded-lg bg-muted" />
            </div>
          )}
        </main>
      </div>
    );
  }

  if (project.projectType === "exploration" || project.projectType === "formal") {
    router.replace(`/research/${project.id}`);
    return null;
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1500px] items-center px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/")}
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="truncate text-sm font-medium">
              {project.rawIdea}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-4 animate-fade-in sm:px-5">
        <HotellingWorkbench project={project} />
      </main>
    </div>
  );
}

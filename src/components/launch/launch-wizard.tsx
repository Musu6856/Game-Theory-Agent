"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ModelSourceStep } from "./model-source-step";
import {
  MODEL_SOURCE_CONFIGURED_KEY,
  MODEL_SOURCE_STORAGE_KEY,
  hasCompletedModelSourceSetup,
  parseStoredModelSourceSettings,
} from "@/lib/model-source";
import { useStore } from "@/lib/store";
import type { ModelSourceSettings } from "@/lib/types";

export function LaunchWizard() {
  const router = useRouter();
  const { state } = useStore();
  const [settings, setSettings] = useState<ModelSourceSettings>(() => {
    if (typeof window === "undefined") {
      return { source: "paperforge" };
    }

    const stored = window.localStorage.getItem(MODEL_SOURCE_STORAGE_KEY);
    return parseStoredModelSourceSettings(stored);
  });

  useEffect(() => {
    if (
      hasCompletedModelSourceSetup(
        window.localStorage.getItem(MODEL_SOURCE_CONFIGURED_KEY)
      ) ||
      state.projects.length > 0
    ) {
      router.replace("/research");
    }
  }, [router, state.projects.length]);

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_600px]">
      <section className="hidden border-r bg-muted/35 p-10 lg:flex lg:flex-col xl:p-14">
        <div className="font-serif text-2xl font-semibold">PaperForge</div>
        <div className="my-auto max-w-lg space-y-5">
          <p className="font-mono text-xs uppercase tracking-wide text-primary">
            Research Workflow
          </p>
          <h1 className="font-serif text-4xl font-semibold leading-tight">
            先选模型来源，再把研究想法交给工作台展开
          </h1>
          <p className="text-sm leading-7 text-muted-foreground">
            这一版会进入方向发现、模型建立和符号分析的工作流。仿真暂不进入流程，避免理论推导被数值代入打断。
          </p>
          <div className="space-y-3 pt-4">
            {["方向发现", "模型建立", "均衡求解", "性质分析"].map(
              (item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-4 rounded-lg border bg-card px-5 py-4 shadow-sm"
                >
                  <span className="font-mono text-xs text-primary">
                    0{index + 1}
                  </span>
                  <span className="font-serif text-base">{item}</span>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      <section className="flex min-h-screen flex-col bg-card px-5 py-8 sm:px-10 lg:px-14">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-primary">
              Model Source
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold">
              选择模型来源
            </h2>
          </div>
        </div>

        <ModelSourceStep
          settings={settings}
          onSettingsChange={setSettings}
        />
      </section>
    </main>
  );
}

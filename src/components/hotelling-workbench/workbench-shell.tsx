"use client";

import type { ReactNode } from "react";
import {
  BookOpen,
  FunctionSquare,
  Lightbulb,
  Network,
  Sigma,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkbenchStep =
  | "background"
  | "literature"
  | "model"
  | "equilibrium"
  | "analysis";

interface WorkbenchShellProps {
  activeStep: WorkbenchStep;
  onStepChange: (step: WorkbenchStep) => void;
  title: string;
  main: ReactNode;
  side: ReactNode;
}

const STEPS: Array<{
  key: WorkbenchStep;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "background", label: "背景故事", icon: Lightbulb },
  { key: "literature", label: "文献启发", icon: BookOpen },
  { key: "model", label: "模型建立", icon: Network },
  { key: "equilibrium", label: "均衡求解", icon: Sigma },
  { key: "analysis", label: "性质分析", icon: FunctionSquare },
];

export function WorkbenchShell({
  activeStep,
  onStepChange,
  title,
  main,
  side,
}: WorkbenchShellProps) {
  return (
    <section className="w-full rounded-lg border bg-background text-foreground shadow-xs">
      <div className="flex min-h-12 items-center border-b px-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Hotelling Workbench
          </p>
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
      </div>

      <div className="grid min-h-[620px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        <nav
          className="border-b bg-muted/20 p-2 lg:border-b-0 lg:border-r"
          aria-label="Hotelling 工作台步骤"
        >
          <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-x-visible">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = activeStep === step.key;

              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => onStepChange(step.key)}
                  className={cn(
                    "flex h-10 min-w-30 shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium transition-colors lg:min-w-0",
                    isActive
                      ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:bg-background/75 hover:text-foreground"
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px]",
                      isActive
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{step.label}</span>
                  <span className="ml-auto hidden text-[10px] text-muted-foreground lg:inline">
                    {index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <main className="min-w-0 border-b p-4 lg:border-b-0 lg:border-r">
          {main}
        </main>

        <aside className="min-w-0 bg-muted/15 p-4">{side}</aside>
      </div>
    </section>
  );
}

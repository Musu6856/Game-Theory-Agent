import { CheckCircle2, CircleDot } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ResearchSession } from "@/lib/types";

const PHASES: { id: ResearchSession["phase"]; label: string }[] = [
  { id: "direction", label: "方向发现" },
  { id: "model", label: "模型确认" },
  { id: "equilibrium", label: "均衡推导" },
  { id: "analysis", label: "性质分析" },
  { id: "paper", label: "论文输出" },
];

export function PhaseIndicator({ phase }: { phase: ResearchSession["phase"] }) {
  const activeIndex = PHASES.findIndex((item) => item.id === phase);

  return (
    <div
      className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto pb-1 text-[11px] sm:flex-wrap sm:overflow-visible sm:pb-0"
      aria-label="研究阶段"
    >
      {PHASES.map((item, index) => {
        const isActive = index === activeIndex;
        const isComplete = activeIndex > index;

        return (
          <span
            key={item.id}
            className={cn(
              "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 leading-none transition-colors",
              isActive &&
                "border-primary bg-primary text-primary-foreground shadow-sm",
              !isActive &&
                isComplete &&
                "border-primary/20 bg-primary/5 text-foreground",
              !isActive &&
                !isComplete &&
                "border-border bg-muted/40 text-muted-foreground"
            )}
          >
            {isComplete ? (
              <CheckCircle2 className="size-3" />
            ) : isActive ? (
              <CircleDot className="size-3" />
            ) : (
              <span className="size-1.5 rounded-full bg-current/40" />
            )}
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

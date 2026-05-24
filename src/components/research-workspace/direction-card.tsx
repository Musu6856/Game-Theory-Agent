import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EvidenceSource, ResearchDirection } from "@/lib/types";

export function DirectionCard({
  direction,
  evidenceSources = [],
  adopted,
  disabled,
  isAdopting,
  onAdopt,
}: {
  direction: ResearchDirection;
  evidenceSources?: EvidenceSource[];
  adopted: boolean;
  disabled?: boolean;
  isAdopting?: boolean;
  onAdopt: (directionId: string) => void;
}) {
  const matchedSources = evidenceSources.filter((source) =>
    direction.evidenceSourceIds?.includes(source.id)
  );

  return (
    <article
      className="flex min-w-0 flex-col rounded-lg border bg-card p-4 transition-colors hover:border-primary/60 data-[adopted=true]:border-primary data-[adopted=true]:bg-accent/55"
      data-adopted={adopted}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-base font-semibold leading-6">
          {direction.title}
        </h3>
        {direction.recommended && (
          <Badge variant="secondary" className="shrink-0">
            推荐方向
          </Badge>
        )}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {direction.summary}
      </p>
      <div className="mt-4 space-y-2 text-xs leading-5">
        <p>
          <span className="font-medium text-foreground">模型结构：</span>
          <span className="text-muted-foreground">{direction.model}</span>
        </p>
        <p>
          <span className="font-medium text-foreground">贡献焦点：</span>
          <span className="text-muted-foreground">{direction.contribution}</span>
        </p>
      </div>
      {(direction.evidenceNote || matchedSources.length > 0) && (
        <div className="mt-4 rounded-md border bg-background/60 p-3 text-xs leading-5">
          <p className="font-medium text-foreground">证据依据</p>
          {direction.evidenceNote && (
            <p className="mt-1 text-muted-foreground">
              {formatEvidenceNote(direction.evidenceNote)}
            </p>
          )}
          {matchedSources.length > 0 && (
            <ul className="mt-2 space-y-1">
              {matchedSources.map((source) => (
                <li key={source.id}>
                  <a
                    className="text-primary underline-offset-4 hover:underline"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    [{source.id}] {source.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        {adopted ? (
          <Button variant="secondary" size="sm" disabled className="gap-1.5">
            <CheckCircle2 className="size-3.5" />
            已采用此方向
          </Button>
        ) : (
        <Button
          variant={disabled ? "secondary" : "outline"}
          size="sm"
          className="gap-1.5"
          disabled={disabled || isAdopting}
          onClick={() => onAdopt(direction.id)}
        >
            {isAdopting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowRight className="size-3.5" />
            )}
            {isAdopting ? "正在采用..." : "采用这个方向"}
          </Button>
        )}
      </div>
    </article>
  );
}

function formatEvidenceNote(note: string) {
  if (note === "No reliable source found in this run.") {
    return "本轮未找到可靠来源。";
  }

  return note;
}

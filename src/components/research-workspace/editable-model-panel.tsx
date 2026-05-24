"use client";

import { Save } from "lucide-react";
import { useState } from "react";

type EditableModelPanelProps = {
  assumptions: string[];
  disabled?: boolean;
  onSaveAssumptions?: (assumptions: string[]) => Promise<void> | void;
};

export function EditableModelPanel({
  assumptions,
  disabled,
  onSaveAssumptions,
}: EditableModelPanelProps) {
  const signature = normalizeAssumptions(assumptions.join("\n"));

  return (
    <EditableModelPanelDraft
      key={signature}
      initialDraft={signature}
      disabled={disabled}
      onSaveAssumptions={onSaveAssumptions}
    />
  );
}

function EditableModelPanelDraft({
  initialDraft,
  disabled,
  onSaveAssumptions,
}: {
  initialDraft: string;
  disabled?: boolean;
  onSaveAssumptions?: (assumptions: string[]) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const savedDraft = initialDraft;
  const normalizedSavedDraft = normalizeAssumptions(savedDraft);
  const normalizedDraft = normalizeAssumptions(draft);
  const draftAssumptions = normalizedDraft ? normalizedDraft.split("\n") : [];
  const hasChanges = normalizedDraft !== normalizedSavedDraft;
  const canSave =
    Boolean(onSaveAssumptions) &&
    !disabled &&
    hasChanges &&
    normalizedDraft.length > 0;

  async function handleSave() {
    if (!canSave || !onSaveAssumptions) return;
    const nextAssumptions = draft
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    await onSaveAssumptions(nextAssumptions);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">模型假设</div>
          <div className="text-xs leading-5 text-muted-foreground">
            修改假设后，均衡和性质会标记为需要重新检查。
          </div>
        </div>
        <div className="text-xs leading-5 text-muted-foreground">
          {draftAssumptions.length} 条
        </div>
      </div>

      {draftAssumptions.length > 0 ? (
        <ol className="overflow-hidden rounded-md border bg-muted/20">
          {draftAssumptions.map((assumption, index) => (
            <li
              key={`${index}-${assumption}`}
              className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-border/70 px-2.5 py-2 text-xs leading-5 last:border-b-0"
            >
              <span className="font-mono text-[11px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 break-words text-foreground">
                {assumption}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-md border border-dashed px-3 py-3 text-xs leading-5 text-muted-foreground">
          暂无可保存的模型假设。
        </div>
      )}

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="编辑模型假设"
        className="min-h-32 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={disabled}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs leading-5 text-muted-foreground">
          {hasChanges ? "有未保存修改" : "假设已同步"}
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={!canSave}
          onClick={() => void handleSave()}
        >
          <Save size={15} />
          保存模型修改
        </button>
      </div>
    </section>
  );
}

function normalizeAssumptions(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

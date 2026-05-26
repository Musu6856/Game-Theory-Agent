"use client";

import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { MathChip } from "@/components/hotelling-workbench/math-chip";
import { SymbolEditor } from "@/components/hotelling-workbench/symbol-editor";
import { Button } from "@/components/ui/button";
import {
  createSymbolDraftForRole,
  groupSymbolRegistryForDisplay,
  normalizeSymbolRegistry,
} from "@/lib/symbol-governance";
import type { SymbolDefinition, SymbolRole, SymbolSide } from "@/lib/types";

type EditableSymbolRegistryProps = {
  symbols: unknown;
  disabled?: boolean;
  onSaveSymbols?: (symbols: SymbolDefinition[]) => Promise<void> | void;
};

export function EditableSymbolRegistry({
  symbols,
  disabled,
  onSaveSymbols,
}: EditableSymbolRegistryProps) {
  const normalizedSymbols = normalizeSymbolRegistry(symbols);
  const signature = snapshotSymbols(normalizedSymbols);

  return (
    <EditableSymbolRegistryDraft
      key={signature}
      initialSymbols={normalizedSymbols}
      disabled={disabled}
      onSaveSymbols={onSaveSymbols}
    />
  );
}

function EditableSymbolRegistryDraft({
  initialSymbols,
  disabled,
  onSaveSymbols,
}: {
  initialSymbols: SymbolDefinition[];
  disabled?: boolean;
  onSaveSymbols?: (symbols: SymbolDefinition[]) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(initialSymbols);
  const [expandedSymbolId, setExpandedSymbolId] = useState<string | null>(null);
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);

  const registryDisplay = useMemo(
    () => groupSymbolRegistryForDisplay(draft),
    [draft]
  );
  const issuePreview = registryDisplay.issues.slice(0, 4);
  const hasChanges = snapshotSymbols(draft) !== snapshotSymbols(initialSymbols);
  const canSave = Boolean(onSaveSymbols) && !disabled && hasChanges;

  function updateSymbol(nextSymbol: SymbolDefinition) {
    setDraft((current) =>
      current.map((symbol) =>
        symbol.id === nextSymbol.id ? nextSymbol : symbol
      )
    );
  }

  function addSymbol(role: SymbolRole = "parameter") {
    const nextSymbol = createSymbolDraftForRole(role);

    setDraft((current) => [...current, nextSymbol]);
    setExpandedSymbolId(nextSymbol.id);
    setIsRegistryOpen(true);
  }

  function deleteSymbol(id: string) {
    setDraft((current) => current.filter((symbol) => symbol.id !== id));
    setExpandedSymbolId((current) => (current === id ? null : current));
  }

  function resetDraft() {
    setDraft(initialSymbols);
    setExpandedSymbolId(null);
    setIsRegistryOpen(false);
  }

  async function handleSave() {
    if (!canSave || !onSaveSymbols) return;
    await onSaveSymbols(draft);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">符号治理</h4>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            把正文里反复出现的记号统一登记在这里，后续对话、均衡和性质分析都会复用这张表。
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => addSymbol()}
          disabled={disabled}
        >
          <Plus className="size-3.5" />
          符号
        </Button>
      </div>

      <div className="grid gap-2 text-[11px] leading-5 text-muted-foreground sm:grid-cols-3">
        <InfoTile label="已定义" value={`${registryDisplay.totals.total} 个`} />
        <InfoTile
          label="推荐项"
          value={`${registryDisplay.totals.recommended} 个`}
        />
        <InfoTile label="提醒" value={`${registryDisplay.totals.issueCount} 条`} />
      </div>

      <details
        className="rounded-md border bg-muted/15 px-3 py-2.5"
        open={isRegistryOpen}
        onToggle={(event) => setIsRegistryOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
          展开符号表、提醒和编辑项
        </summary>
        <div className="mt-3 space-y-3 border-t pt-3">
          {issuePreview.length > 0 ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-[oklch(0.985_0.02_85)] px-3 py-3 text-xs leading-5 text-[oklch(0.42_0.06_67)]">
              {issuePreview.map((issue) => (
                <div key={`${issue.code}-${issue.message}`} className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{issue.message}</span>
                </div>
              ))}
              {registryDisplay.issues.length > issuePreview.length ? (
                <p className="pl-5 text-[11px] text-muted-foreground">
                  还有 {registryDisplay.issues.length - issuePreview.length} 条提醒未展开。
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            {registryDisplay.groups.map((group) => (
              <SymbolRoleGroup
                key={group.role}
                group={group}
                disabled={disabled}
                expandedSymbolId={expandedSymbolId}
                onAdd={() => addSymbol(group.role)}
                onDelete={deleteSymbol}
                onExpandedChange={setExpandedSymbolId}
                onUpdate={updateSymbol}
              />
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={resetDraft}
              disabled={!hasChanges || disabled}
            >
              <RotateCcw className="size-3.5" />
              恢复
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              onClick={() => void handleSave()}
              disabled={!canSave}
            >
              保存符号表
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}

function SymbolRoleGroup({
  group,
  disabled,
  expandedSymbolId,
  onAdd,
  onDelete,
  onExpandedChange,
  onUpdate,
}: {
  group: {
    role: SymbolRole;
    label: string;
    count: number;
    issueCount: number;
    symbols: Array<{
      symbol: SymbolDefinition;
      issueCount: number;
    }>;
  };
  disabled?: boolean;
  expandedSymbolId: string | null;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onExpandedChange: (id: string | null) => void;
  onUpdate: (symbol: SymbolDefinition) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <h5 className="text-[11px] font-semibold text-muted-foreground">
            {group.label}
          </h5>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {group.count} 个{group.issueCount ? ` · ${group.issueCount} 条提醒` : ""}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onAdd}
          disabled={disabled}
          aria-label={`在${group.label}中新增符号`}
          title="新增"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border bg-background">
        {group.symbols.length > 0 ? (
          group.symbols.map(({ symbol, issueCount }) => {
            const isExpanded = expandedSymbolId === symbol.id;

            return (
              <article
                key={symbol.id}
                className="border-b border-border/70 last:border-b-0"
              >
                <div
                  className={`flex items-start gap-2 px-2.5 py-2 ${
                    isExpanded ? "bg-muted/30" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 text-left"
                    onClick={() =>
                      onExpandedChange(isExpanded ? null : symbol.id)
                    }
                  >
                    <MathChip symbol={symbol} density="compact" />
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {symbol.name || symbol.codeName || symbol.symbol}
                        </span>
                        {symbol.recommended ? (
                          <span className="rounded-sm border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            推荐
                          </span>
                        ) : null}
                        {issueCount > 0 ? (
                          <span className="rounded-sm border border-amber-200 bg-[oklch(0.985_0.02_85)] px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.42_0.06_67)]">
                            {issueCount} 提醒
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{getSymbolSideLabel(symbol.side)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">
                          {symbol.assumption || "未设定"}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                        {symbol.meaning || "尚未填写含义"}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        onExpandedChange(isExpanded ? null : symbol.id)
                      }
                      disabled={disabled}
                      aria-label={isExpanded ? "收起符号编辑" : "展开符号编辑"}
                      title={isExpanded ? "收起" : "展开"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onDelete(symbol.id)}
                      disabled={disabled}
                      aria-label={`删除 ${symbol.name || symbol.codeName || symbol.symbol}`}
                      title="删除符号"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-t bg-background px-3 py-3">
                    <SymbolEditor symbol={symbol} onChange={onUpdate} />
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="flex items-center justify-between gap-3 px-3 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">这一类还没有符号</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                先点右侧加号补一个，默认会继承这个类别的侧别。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onAdd}
              disabled={disabled}
            >
              <Plus className="size-3.5" />
              新增
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function snapshotSymbols(symbols: SymbolDefinition[]) {
  return JSON.stringify(
    symbols.map((symbol) => ({
      id: symbol.id,
      symbol: symbol.symbol,
      baseSymbol: symbol.baseSymbol,
      subscript: symbol.subscript ?? "",
      superscript: symbol.superscript ?? "",
      codeName: symbol.codeName,
      name: symbol.name,
      meaning: symbol.meaning,
      role: symbol.role,
      side: symbol.side,
      assumption: symbol.assumption,
      recommended: symbol.recommended,
    }))
  );
}

function getSymbolSideLabel(side: SymbolSide) {
  switch (side) {
    case "platform":
      return "平台";
    case "consumer":
      return "消费者侧";
    case "merchant":
      return "商家侧";
    case "both":
      return "双边";
    case "global":
      return "全局";
  }
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-medium text-foreground">{value}</p>
    </div>
  );
}

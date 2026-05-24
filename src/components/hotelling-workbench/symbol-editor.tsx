"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SymbolDefinition, SymbolRole, SymbolSide } from "@/lib/types";
import { MathChip } from "./math-chip";

const ROLE_OPTIONS: Array<{ value: SymbolRole; label: string }> = [
  { value: "parameter", label: "参数" },
  { value: "decision", label: "决策变量" },
  { value: "demand", label: "需求变量" },
  { value: "utility", label: "效用项" },
  { value: "cost", label: "成本参数" },
  { value: "derived", label: "派生变量" },
];

const SIDE_OPTIONS: Array<{ value: SymbolSide; label: string }> = [
  { value: "platform", label: "平台" },
  { value: "consumer", label: "消费者侧" },
  { value: "merchant", label: "商家侧" },
  { value: "both", label: "双边" },
  { value: "global", label: "全局" },
];

function toDisplaySymbol(symbol: Pick<SymbolDefinition, "baseSymbol" | "subscript" | "superscript">) {
  const base = symbol.baseSymbol.trim() || "x";
  const subscript = symbol.subscript?.trim();
  const superscript = symbol.superscript?.trim();

  return `${base}${subscript ? `_${subscript}` : ""}${
    superscript ? `^${superscript}` : ""
  }`;
}

function toCodeName(symbol: Pick<SymbolDefinition, "baseSymbol" | "subscript" | "superscript">) {
  return [symbol.baseSymbol, symbol.subscript, symbol.superscript]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function SymbolEditor({
  symbol,
  onChange,
}: {
  symbol: SymbolDefinition;
  onChange: (symbol: SymbolDefinition) => void;
}) {
  function update<K extends keyof SymbolDefinition>(
    key: K,
    value: SymbolDefinition[K]
  ) {
    const nextSymbol = {
      ...symbol,
      [key]: value,
    };

    if (
      key === "baseSymbol" ||
      key === "subscript" ||
      key === "superscript"
    ) {
      nextSymbol.symbol = toDisplaySymbol(nextSymbol);
      if (!symbol.codeName.trim() || symbol.codeName === toCodeName(symbol)) {
        nextSymbol.codeName = toCodeName(nextSymbol);
      }
    }

    onChange(nextSymbol);
  }

  const previewSymbol = {
    ...symbol,
    symbol: toDisplaySymbol(symbol),
    baseSymbol: symbol.baseSymbol.trim() || "x",
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3 border-b pb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            预览
          </p>
          <div className="mt-1">
            <MathChip symbol={previewSymbol} />
          </div>
        </div>
        <p className="min-w-0 flex-1 break-words text-xs leading-5 text-muted-foreground">
          下标建议表示平台或主体，上标建议表示消费者侧 C、商家侧 M；求解变量由系统自动生成。
        </p>
      </div>

      <div className="grid min-w-0 gap-2 md:grid-cols-3">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${symbol.id}-baseSymbol`} className="text-xs">
            主符号
          </Label>
          <Input
            id={`${symbol.id}-baseSymbol`}
            value={symbol.baseSymbol}
            onChange={(event) =>
              update("baseSymbol", event.currentTarget.value)
            }
            placeholder="n"
            className="text-sm"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${symbol.id}-subscript`} className="text-xs">
            下标
          </Label>
          <Input
            id={`${symbol.id}-subscript`}
            value={symbol.subscript ?? ""}
            onChange={(event) => update("subscript", event.currentTarget.value)}
            placeholder="i"
            className="text-sm"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${symbol.id}-superscript`} className="text-xs">
            上标
          </Label>
          <Input
            id={`${symbol.id}-superscript`}
            value={symbol.superscript ?? ""}
            onChange={(event) =>
              update("superscript", event.currentTarget.value)
            }
            placeholder="C"
            className="text-sm"
          />
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            求解变量（自动）
          </p>
          <code className="rounded bg-background px-2 py-1 font-mono text-xs text-foreground">
            {symbol.codeName || toCodeName(previewSymbol) || "auto_symbol"}
          </code>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          仅供系统生成 SymPy/Python 求解代码使用，论文中继续使用上方预览符号。
        </p>
      </div>

      <div className="grid min-w-0 gap-2 md:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${symbol.id}-name`} className="text-xs">
            名称
          </Label>
          <Input
            id={`${symbol.id}-name`}
            value={symbol.name}
            onChange={(event) => update("name", event.currentTarget.value)}
            placeholder="消费者需求"
            className="text-sm"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${symbol.id}-assumption`} className="text-xs">
            假设
          </Label>
          <Input
            id={`${symbol.id}-assumption`}
            value={symbol.assumption}
            onChange={(event) =>
              update("assumption", event.currentTarget.value)
            }
            placeholder="正数、非负、实数、取值在 [0,1]"
            className="text-sm"
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-2 md:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${symbol.id}-role`} className="text-xs">
            角色
          </Label>
          <select
            id={`${symbol.id}-role`}
            value={symbol.role}
            onChange={(event) =>
              update("role", event.currentTarget.value as SymbolRole)
            }
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${symbol.id}-side`} className="text-xs">
            所属侧
          </Label>
          <select
            id={`${symbol.id}-side`}
            value={symbol.side}
            onChange={(event) =>
              update("side", event.currentTarget.value as SymbolSide)
            }
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {SIDE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={`${symbol.id}-meaning`} className="text-xs">
          含义
        </Label>
        <Textarea
          id={`${symbol.id}-meaning`}
          value={symbol.meaning}
          onChange={(event) => update("meaning", event.currentTarget.value)}
          rows={2}
          placeholder="选择平台 i 的消费者数量。"
          className="min-h-16 resize-y text-sm leading-5"
        />
      </div>
    </div>
  );
}

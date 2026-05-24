"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ code }: { code: string }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const trimmedCode = code.trim();
  const hasCode = trimmedCode.length > 0;
  const copied = copyStatus === "success";

  async function copyCode() {
    if (!hasCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmedCode);
      setCopyStatus("success");
      window.setTimeout(() => setCopyStatus("idle"), 1400);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2200);
    }
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex min-h-9 items-center justify-between gap-3 border-b bg-muted/45 px-3">
        <span className="text-xs font-medium text-muted-foreground">
          可复用代码
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="min-w-0 truncate text-[11px] text-destructive"
            aria-live="polite"
          >
            {copyStatus === "error" ? "复制失败，请手动选择代码" : ""}
          </span>
          <button
            type="button"
            onClick={copyCode}
            disabled={!hasCode}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={copied ? "已复制代码" : "复制代码"}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>
      {hasCode ? (
        <pre className="max-h-[420px] overflow-auto p-3 text-xs leading-5 text-foreground">
          <code>{trimmedCode}</code>
        </pre>
      ) : (
        <div className="flex min-h-32 items-center px-3 py-6 text-sm text-muted-foreground">
          生成均衡后会显示可复用代码
        </div>
      )}
    </div>
  );
}

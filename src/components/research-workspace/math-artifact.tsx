import { MarkdownRenderer } from "@/components/markdown-renderer";
import { formatMathArtifactContent } from "@/lib/math-artifact-format";

export function MathArtifact({
  formula,
  variant = "default",
}: {
  formula: string;
  variant?: "default" | "embedded";
}) {
  const content = formatMathArtifactContent(formula);

  return (
    <div
      className={
        variant === "embedded"
          ? "overflow-x-auto"
          : "overflow-x-auto rounded-md border bg-background px-3 py-2"
      }
    >
      <MarkdownRenderer content={content} className="reader-page text-sm" />
    </div>
  );
}

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import { normalizeMarkdownMath } from "@/lib/markdown-math";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  const safeContent = normalizeMarkdownMath(content);

  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className || ""}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {safeContent}
      </ReactMarkdown>
    </div>
  );
}

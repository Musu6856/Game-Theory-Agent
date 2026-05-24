const MARKDOWN_PROTECTED_PATTERN =
  /(```[\s\S]*?```|`[^`\n]*`|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;
const BARE_SYMBOLIC_TOKEN_PATTERN =
  /(?<![A-Za-z0-9\\$`])(?:[A-Za-z]+(?:_[A-Za-z0-9]+)+(?:\^(?:\*|[A-Za-z0-9]+))?|[A-Za-z]+(?:\^(?:\*|[A-Za-z0-9]+)))(?![A-Za-z0-9`])/g;

function stabilizeMath(content: string) {
  return content
    .replace(/\\underbrace\{([^{}]+)\}_\{([^{}]+)\}/g, "$1")
    .replace(/\\overbrace\{([^{}]+)\}\^\{([^{}]+)\}/g, "$1")
    .replace(/\\underbrace\{([^{}]+)\}_\{\\text\{([^{}]+)\}\}/g, "$1")
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, expression: string) => `$${expression}$`)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, expression: string) => `$$${expression}$$`);
}

function wrapBareSymbolicTokensOutsideMath(content: string) {
  let normalized = "";
  let lastIndex = 0;

  for (const match of content.matchAll(MARKDOWN_PROTECTED_PATTERN)) {
    const index = match.index ?? 0;
    normalized += content
      .slice(lastIndex, index)
      .replace(BARE_SYMBOLIC_TOKEN_PATTERN, "$$$&$");
    normalized += match[0];
    lastIndex = index + match[0].length;
  }

  normalized += content
    .slice(lastIndex)
    .replace(BARE_SYMBOLIC_TOKEN_PATTERN, "$$$&$");
  return normalized;
}

export function normalizeMarkdownMath(content: string) {
  return wrapBareSymbolicTokensOutsideMath(stabilizeMath(content));
}

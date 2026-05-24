const TITLE_MAX_LENGTH = 28;

function stripMarkdown(value: string) {
  return value
    .replace(/[`*_#>~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMeaningfulLine(value: string) {
  return value
    .split(/\r?\n/)
    .map(stripMarkdown)
    .find((line) => line && !/^已识别|^需要补充|^建模要素/.test(line));
}

function extractAfterChineseColon(value: string) {
  const match = value.match(/(?:研究对象|标题|主题|问题|场景)\s*[：:]\s*([^。；;\n]+)/);
  return match?.[1]?.trim();
}

function trimTitle(value: string) {
  const compact = stripMarkdown(value)
    .replace(/^研究对象\s*[：:]\s*/, "")
    .replace(/^研究\s*/, "")
    .replace(/[，,。；;].*$/, "")
    .trim();

  return compact.length > TITLE_MAX_LENGTH
    ? `${compact.slice(0, TITLE_MAX_LENGTH)}...`
    : compact;
}

export function cleanWorkbenchTitle(refinedIdea: string, rawIdea: string) {
  const refinedTarget =
    extractAfterChineseColon(refinedIdea) || firstMeaningfulLine(refinedIdea);
  const rawTarget = extractAfterChineseColon(rawIdea) || firstMeaningfulLine(rawIdea);
  const title = trimTitle(refinedTarget || rawTarget || "未命名研究项目");

  return title || "未命名研究项目";
}

const CJK_TEXT_PATTERN = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const MATH_DELIMITER_PATTERN =
  /(^|[^\\])(\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/;
const LATEX_SIGNAL_PATTERN =
  /\\(frac|partial|Pi|tau|alpha|beta|Delta|theta|quad|cdot|in|leq|geq|Leftrightarrow|underline|overline)|[_^{}]|[=<>+\-*/]|[∂ΠτθαβΔ]/;
const WHOLE_MATH_DELIMITER_PATTERN = /^\$([^$]+)\$$/;

export function shouldRenderAsPlainMath(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (CJK_TEXT_PATTERN.test(trimmed)) return false;
  return LATEX_SIGNAL_PATTERN.test(trimmed);
}

export function formatMathArtifactContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return "";
  const wholeMath = trimmed.match(WHOLE_MATH_DELIMITER_PATTERN);
  if (wholeMath && CJK_TEXT_PATTERN.test(wholeMath[1])) {
    return wholeMath[1].trim();
  }
  if (MATH_DELIMITER_PATTERN.test(trimmed)) return trimmed;
  if (shouldRenderAsPlainMath(trimmed)) return `$${trimmed}$`;
  return trimmed;
}

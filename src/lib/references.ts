import type { Reference } from "./types";

const CATEGORY_BY_HEADING: Array<[RegExp, Reference["category"]]> = [
  [/two-sided|platform|双边|平台/i, "two-sided"],
  [/method|approach|方法/i, "methodology"],
  [/foundation|theory|经典|基础/i, "foundational"],
];

function categoryFromHeading(heading: string): Reference["category"] {
  return (
    CATEGORY_BY_HEADING.find(([pattern]) => pattern.test(heading))?.[1] ??
    "foundational"
  );
}

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/^[-*]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function parseDelimitedReference(
  line: string,
  category: Reference["category"]
): Reference | null {
  const parts = cleanInlineMarkdown(line)
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 4) return null;

  const year = Number(parts[2].match(/\d{4}/)?.[0]);
  if (!Number.isFinite(year)) return null;

  return {
    title: parts[0],
    authors: parts[1],
    year,
    relevance: parts.slice(3).join(" | "),
    category,
  };
}

function parseLooseReference(
  line: string,
  category: Reference["category"]
): Reference | null {
  const cleaned = cleanInlineMarkdown(line);
  const yearMatch = cleaned.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return null;

  const year = Number(yearMatch[0]);
  const titleMatch =
    cleaned.match(/"([^"]+)"/) ||
    cleaned.match(/“([^”]+)”/) ||
    cleaned.match(/\*\*([^*]+)\*\*/);
  const title =
    titleMatch?.[1]?.trim() ||
    cleaned
      .slice(0, yearMatch.index)
      .replace(/[,(，-]+$/g, "")
      .trim();

  if (!title) return null;

  const beforeYear = cleaned.slice(0, yearMatch.index).trim();
  const afterYear = cleaned.slice((yearMatch.index ?? 0) + 4).trim();
  const authors =
    beforeYear
      .replace(title, "")
      .replace(/[(),，。:：\-–—]+/g, " ")
      .trim() || "Unknown";

  return {
    title,
    authors,
    year,
    relevance: afterYear.replace(/^[).,，。:：\-–—\s]+/, "") || cleaned,
    category,
  };
}

export function parseReferencesFromMarkdown(content: string): Reference[] {
  const references: Reference[] = [];
  let currentCategory: Reference["category"] = "foundational";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#{1,4}\s+/.test(line)) {
      currentCategory = categoryFromHeading(line);
      continue;
    }

    if (!/^([-*]|\d+[.)])\s+/.test(line)) continue;

    const parsed =
      parseDelimitedReference(line, currentCategory) ||
      parseLooseReference(line, currentCategory);

    if (parsed) {
      references.push(parsed);
    }
  }

  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.title.toLowerCase()}-${reference.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

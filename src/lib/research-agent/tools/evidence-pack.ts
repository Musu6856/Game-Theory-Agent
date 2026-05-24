import type { EvidencePack, EvidenceSource, EvidenceSourceType } from "../state";
import { isPublicHttpUrl } from "../guards.ts";

export type EvidenceCandidate = {
  title: string;
  url: string;
  sourceType: EvidenceSourceType;
  publishedAt?: string;
  snippet: string;
  relevance: string;
};

export function buildEvidencePack({
  query,
  sources,
  now = Date.now(),
  maxSources = 8,
}: {
  query: string;
  sources: EvidenceCandidate[];
  now?: number;
  maxSources?: number;
}): EvidencePack {
  const seen = new Set<string>();
  const normalized: EvidenceSource[] = [];

  for (const source of rankEvidenceCandidates(sources)) {
    if (normalized.length >= maxSources) break;
    const title = compactText(source.title, 180);
    const url = normalizeSourceUrl(source.url);
    const snippet = compactText(source.snippet, 500);
    const relevance = compactText(source.relevance, 280);
    const sourceType = classifySourceType(source);
    const dedupeKeys = createSourceDedupeKeys(title, url, sourceType);

    if (
      !title ||
      !url ||
      !snippet ||
      !relevance ||
      dedupeKeys.some((key) => seen.has(key))
    ) {
      continue;
    }

    for (const key of dedupeKeys) {
      seen.add(key);
    }
    normalized.push({
      id: `src-${normalized.length + 1}`,
      title,
      url,
      sourceType,
      ...(source.publishedAt ? { publishedAt: compactText(source.publishedAt, 40) } : {}),
      retrievedAt: now,
      snippet,
      summary: summarizeSource(snippet),
      relevance,
    });
  }

  return {
    query: query.trim(),
    createdAt: now,
    sources: normalized,
    summary:
      normalized.length > 0
        ? `${normalized.length} sources retained for evidence-backed direction discovery.`
        : "No reliable public sources were retained for this evidence pack.",
  };
}

function rankEvidenceCandidates(sources: EvidenceCandidate[]) {
  return sources
    .map((source, index) => ({
      source,
      index,
      score: getSourceQualityScore(source),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.source);
}

function getSourceQualityScore(source: EvidenceCandidate) {
  const url = parseUrl(source.url);
  const host = url?.hostname.replace(/^www\./, "") ?? "";
  const lowerUrl = source.url.toLowerCase();
  const lowerTitle = source.title.toLowerCase();
  let score = 0;

  if (classifySourceType(source) === "paper") score += 80;
  if (source.sourceType === "policy") score += 45;
  if (source.sourceType === "industry") score += 25;

  if (isScholarlyHost(host)) score += 25;
  if (lowerUrl.includes("doi.org/") || lowerUrl.includes("/doi/")) score += 20;
  if (isPublisherHost(host)) score += 18;
  if (lowerUrl.includes("ssrn.com")) score += 8;
  if (lowerUrl.endsWith(".pdf") || lowerUrl.includes(".pdf?")) score += 12;
  if (/\b(journal|review|working paper|paper|ssrn)\b/i.test(lowerTitle)) {
    score += 8;
  }

  return score;
}

function classifySourceType(source: EvidenceCandidate): EvidenceSourceType {
  if (source.sourceType !== "web") return source.sourceType;

  const url = parseUrl(source.url);
  const host = url?.hostname.replace(/^www\./, "") ?? "";
  const lowerUrl = source.url.toLowerCase();

  if (
    isScholarlyHost(host) ||
    lowerUrl.includes("doi.org/") ||
    lowerUrl.includes("/doi/") ||
    lowerUrl.endsWith(".pdf") ||
    lowerUrl.includes(".pdf?")
  ) {
    return "paper";
  }

  return "web";
}

function createSourceDedupeKeys(
  title: string,
  url: string,
  sourceType: EvidenceSourceType
) {
  const parsedUrl = parseUrl(url);
  const doi = extractDoi(url);
  const titleKey = normalizeTitleForDedupe(title);
  const keys: string[] = [];

  if (doi) keys.push(`doi:${doi}`);
  if (sourceType === "paper" && titleKey.length >= 20) {
    keys.push(`title:${titleKey}`);
  }

  if (!parsedUrl) return keys.length > 0 ? keys : [`url:${url}`];
  parsedUrl.hash = "";
  parsedUrl.search = "";
  keys.push(`url:${parsedUrl.toString()}`);
  return keys;
}

function extractDoi(value: string) {
  const match = value.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
  return match?.[0].replace(/[?#].*$/, "").toLowerCase() ?? "";
}

function normalizeTitleForDedupe(title: string) {
  return title
    .toLowerCase()
    .replace(/\[(pdf|html)\]/g, " ")
    .replace(/\b(pdf|abstract|full text|working paper|copy)\b/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isScholarlyHost(host: string) {
  return [
    "ideas.repec.org",
    "openalex.org",
    "doi.org",
    "pubsonline.informs.org",
    "sciencedirect.com",
    "link.springer.com",
    "journals.uchicago.edu",
    "aeaweb.org",
    "academic.oup.com",
    "cambridge.org",
    "tandfonline.com",
    "onlinelibrary.wiley.com",
    "papers.ssrn.com",
    "nber.org",
    "arxiv.org",
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isPublisherHost(host: string) {
  return [
    "pubsonline.informs.org",
    "sciencedirect.com",
    "link.springer.com",
    "journals.uchicago.edu",
    "aeaweb.org",
    "academic.oup.com",
    "cambridge.org",
    "tandfonline.com",
    "onlinelibrary.wiley.com",
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function formatEvidencePackForPrompt(pack: EvidencePack): string {
  if (pack.sources.length === 0) {
    return [
      `Query: ${pack.query}`,
      "Evidence sources: none retained.",
      "If you propose a direction without reliable sources, set evidenceSourceIds to [] and evidenceNote to \"No reliable source found in this run.\"",
    ].join("\n");
  }

  return [
    `Query: ${pack.query}`,
    `Evidence summary: ${pack.summary}`,
    ...pack.sources.map((source) =>
      [
        `[${source.id}] ${source.title}`,
        `Type: ${source.sourceType}`,
        source.publishedAt ? `Published: ${source.publishedAt}` : null,
        `URL: ${source.url}`,
        `Summary: ${source.summary}`,
        `Relevance: ${source.relevance}`,
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ].join("\n\n");
}

function normalizeSourceUrl(value: string) {
  if (!isPublicHttpUrl(value)) return "";
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function parseUrl(value: string) {
  try {
    if (!isPublicHttpUrl(value)) return null;
    return new URL(value);
  } catch {
    return null;
  }
}

function summarizeSource(snippet: string) {
  return compactText(snippet, 240);
}

function compactText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

import type { EvidenceCandidate } from "./evidence-pack.ts";
import { assertPublicHttpUrlWithDns } from "../guards.ts";

const OPENALEX_WORKS_URL = "https://api.openalex.org/works";
const CROSSREF_WORKS_URL = "https://api.crossref.org/works";
const ARXIV_QUERY_URL = "https://export.arxiv.org/api/query";
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_LIMIT = 4;

type SearchOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  limit?: number;
};

type OpenAlexResponse = {
  results?: Array<{
    id?: string;
    doi?: string;
    display_name?: string;
    publication_year?: number;
    abstract_inverted_index?: Record<string, number[]>;
    primary_location?: {
      landing_page_url?: string;
    };
  }>;
};

type CrossrefResponse = {
  message?: {
    items?: CrossrefItem[];
  };
};

type CrossrefItem = {
  title?: string[];
  DOI?: string;
  URL?: string;
  abstract?: string;
  published?: {
    "date-parts"?: number[][];
  };
  published_print?: {
    "date-parts"?: number[][];
  };
  published_online?: {
    "date-parts"?: number[][];
  };
};

export async function searchOpenLiterature(
  query: string,
  options: SearchOptions = {}
): Promise<EvidenceCandidate[]> {
  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT);
  const [openAlex, crossref, arxiv] = await Promise.allSettled([
    searchOpenAlex(query, { ...options, limit }),
    searchCrossref(query, { ...options, limit }),
    searchArxiv(query, { ...options, limit }),
  ]);

  return [
    ...(openAlex.status === "fulfilled" ? openAlex.value : []),
    ...(crossref.status === "fulfilled" ? crossref.value : []),
    ...(arxiv.status === "fulfilled" ? arxiv.value : []),
  ].slice(0, limit * 3);
}

export async function searchOpenAlex(
  query: string,
  options: SearchOptions = {}
): Promise<EvidenceCandidate[]> {
  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT);
  const url = new URL(OPENALEX_WORKS_URL);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(limit));
  url.searchParams.set(
    "select",
    "id,doi,display_name,publication_year,abstract_inverted_index,primary_location"
  );
  if (process.env.OPENALEX_API_KEY) {
    url.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  }

  const data = (await fetchJson(url, options)) as OpenAlexResponse;
  return (data.results ?? []).flatMap((item) => {
    const title = item.display_name?.trim();
    const urlValue =
      item.doi?.startsWith("http")
        ? item.doi
        : item.doi
          ? `https://doi.org/${item.doi.replace(/^doi:/i, "")}`
          : item.primary_location?.landing_page_url ?? item.id;
    const abstract = abstractFromInvertedIndex(item.abstract_inverted_index);

    if (!title || !urlValue) return [];
    return [
      {
        title,
        url: urlValue,
        sourceType: "paper" as const,
        ...(item.publication_year ? { publishedAt: String(item.publication_year) } : {}),
        snippet: abstract || title,
        relevance: "OpenAlex scholarly metadata related to the research idea.",
      },
    ];
  });
}

export async function searchCrossref(
  query: string,
  options: SearchOptions = {}
): Promise<EvidenceCandidate[]> {
  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT);
  const url = new URL(CROSSREF_WORKS_URL);
  url.searchParams.set("query.bibliographic", query);
  url.searchParams.set("rows", String(limit));

  const data = (await fetchJson(url, options)) as CrossrefResponse;
  return (data.message?.items ?? []).flatMap((item) => {
    const title = item.title?.[0]?.trim();
    const urlValue = item.URL ?? (item.DOI ? `https://doi.org/${item.DOI}` : "");
    const year = extractCrossrefYear(item);

    if (!title || !urlValue) return [];
    return [
      {
        title,
        url: urlValue,
        sourceType: "paper" as const,
        ...(year ? { publishedAt: String(year) } : {}),
        snippet: stripMarkup(item.abstract) || title,
        relevance: "Crossref bibliographic metadata related to the research idea.",
      },
    ];
  });
}

export async function searchArxiv(
  query: string,
  options: SearchOptions = {}
): Promise<EvidenceCandidate[]> {
  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT);
  const url = new URL(ARXIV_QUERY_URL);
  url.searchParams.set("search_query", `all:${query}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(limit));

  const text = await fetchText(url, options);
  return parseArxivEntries(text);
}

async function fetchJson(url: URL, options: SearchOptions) {
  const text = await fetchText(url, options);
  return JSON.parse(text) as unknown;
}

async function fetchText(url: URL, options: SearchOptions) {
  await assertPublicHttpUrlWithDns(url.toString());
  const fetchImpl = options.fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json, application/atom+xml, text/xml;q=0.9, */*;q=0.8",
        "User-Agent": "PaperForge-Agent/0.1 (evidence discovery)",
      },
    });

    if (!response.ok) {
      throw new Error(`Search request failed with ${response.status}`);
    }

    return (await response.text()).slice(0, 250_000);
  } finally {
    clearTimeout(timeout);
  }
}

function abstractFromInvertedIndex(index?: Record<string, number[]>) {
  if (!index) return "";
  const words: Array<{ word: string; position: number }> = [];

  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      words.push({ word, position });
    }
  }

  return words
    .sort((left, right) => left.position - right.position)
    .map((entry) => entry.word)
    .join(" ");
}

function extractCrossrefYear(item: CrossrefItem) {
  return (
    item.published?.["date-parts"]?.[0]?.[0] ??
    item.published_online?.["date-parts"]?.[0]?.[0] ??
    item.published_print?.["date-parts"]?.[0]?.[0]
  );
}

function parseArxivEntries(xml: string): EvidenceCandidate[] {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  return entries.flatMap((match) => {
    const entry = match[1] ?? "";
    const title = decodeXml(readXmlTag(entry, "title"));
    const summary = decodeXml(readXmlTag(entry, "summary"));
    const published = decodeXml(readXmlTag(entry, "published")).slice(0, 10);
    const id = decodeXml(readXmlTag(entry, "id"));

    if (!title || !id) return [];
    return [
      {
        title,
        url: id,
        sourceType: "paper" as const,
        ...(published ? { publishedAt: published } : {}),
        snippet: summary || title,
        relevance: "arXiv open metadata related to the research idea.",
      },
    ];
  });
}

function readXmlTag(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim() ?? "";
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkup(value?: string) {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function clampLimit(limit: number) {
  return Math.min(Math.max(Math.trunc(limit), 1), 10);
}

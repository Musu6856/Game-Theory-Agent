const MAX_EVIDENCE_QUERIES = 5;

const QUERY_EXPANSION_RULES: Array<{
  patterns: string[];
  queries: string[];
}> = [
  {
    patterns: ["补贴", "多归属", "双边", "平台"],
    queries: [
      "platform subsidies seller multihoming two-sided markets",
      "platform competition multihoming Hotelling",
      "two-sided markets pricing subsidies platform competition",
    ],
  },
  {
    patterns: ["hotelling", "霍特林", "平台", "竞争"],
    queries: [
      "Hotelling platform competition two-sided markets",
      "Hotelling model platform pricing network effects",
    ],
  },
  {
    patterns: ["佣金", "费率", "收费", "补贴"],
    queries: [
      "platform commission fees subsidies two-sided markets",
      "platform pricing buyer subsidies seller fees",
    ],
  },
  {
    patterns: ["卖家", "商家", "多归属"],
    queries: [
      "seller multihoming platform competition",
      "merchant multihoming two-sided platforms",
    ],
  },
  {
    patterns: ["质量", "披露", "信任"],
    queries: [
      "quality disclosure trust platform competition",
      "signaling game platform quality disclosure",
    ],
  },
];

const DEFAULT_THEORY_QUERIES = [
  "two-sided markets platform competition Rochet Tirole Armstrong",
  "Hotelling platform competition network effects theoretical model",
];

export function createEvidenceSearchQueries(rawIdea: string): string[] {
  const trimmed = rawIdea.replace(/\s+/g, " ").trim();
  const normalized = trimmed.toLowerCase();
  const queries: string[] = [];

  addQuery(queries, trimmed);

  for (const rule of QUERY_EXPANSION_RULES) {
    if (
      rule.patterns.some((pattern) =>
        normalized.includes(pattern.toLowerCase())
      )
    ) {
      for (const query of rule.queries) {
        addQuery(queries, query);
      }
    }
  }

  for (const query of DEFAULT_THEORY_QUERIES) {
    addQuery(queries, query);
  }

  return queries.slice(0, MAX_EVIDENCE_QUERIES);
}

function addQuery(queries: string[], query: string) {
  const compact = query.replace(/\s+/g, " ").trim();
  if (!compact || queries.includes(compact)) return;
  queries.push(compact);
}

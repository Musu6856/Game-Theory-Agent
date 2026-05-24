import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEvidencePack,
  formatEvidencePackForPrompt,
} from "./evidence-pack.ts";

test("evidence pack deduplicates sources, caps results, and keeps concise metadata", () => {
  const pack = buildEvidencePack({
    query: "two-sided platform subsidy Hotelling",
    now: 1710000000000,
    maxSources: 2,
    sources: [
      {
        title: "Two-sided platforms and buyer subsidies",
        url: "https://doi.org/10.1000/example",
        sourceType: "paper",
        publishedAt: "2022",
        snippet: "A long abstract about two-sided platform competition and buyer subsidies.",
        relevance: "It explains subsidy incentives.",
      },
      {
        title: "Duplicate DOI",
        url: "https://doi.org/10.1000/example",
        sourceType: "paper",
        snippet: "Duplicate should be removed.",
        relevance: "Duplicate.",
      },
      {
        title: "Platform competition handbook",
        url: "https://example.org/report",
        sourceType: "industry",
        snippet: "Public report with platform competition mechanisms.",
        relevance: "Useful applied background.",
      },
    ],
  });

  assert.equal(pack.query, "two-sided platform subsidy Hotelling");
  assert.equal(pack.createdAt, 1710000000000);
  assert.equal(pack.sources.length, 2);
  assert.equal(pack.sources[0].id, "src-1");
  assert.equal(pack.sources[0].retrievedAt, 1710000000000);
  assert.equal(pack.sources[0].summary.includes("long abstract"), true);
  assert.equal(pack.sources[1].url, "https://example.org/report");
  assert.match(pack.summary, /2 sources/);
});

test("evidence prompt format contains source ids and omits full page bodies", () => {
  const pack = buildEvidencePack({
    query: "quality disclosure platform competition",
    now: 1710000000000,
    sources: [
      {
        title: "Quality disclosure in platforms",
        url: "https://openalex.org/W123",
        sourceType: "paper",
        snippet: "This paper studies disclosure and competition.",
        relevance: "Supports a signaling-game direction.",
      },
    ],
  });

  const promptText = formatEvidencePackForPrompt(pack);

  assert.match(promptText, /src-1/);
  assert.match(promptText, /Quality disclosure/);
  assert.match(promptText, /Supports a signaling-game direction/);
  assert.equal(promptText.includes("<html"), false);
});

test("evidence pack prefers scholarly sources and deduplicates by source family", () => {
  const pack = buildEvidencePack({
    query: "platform subsidies seller multihoming",
    now: 1710000000000,
    maxSources: 3,
    sources: [
      {
        title: "Generic platform strategy blog",
        url: "https://example.com/blog/platform-strategy",
        sourceType: "web",
        snippet: "A general blog post about platform subsidy strategy.",
        relevance: "General background.",
      },
      {
        title: "Platform Competition with Multihoming on Both Sides",
        url: "https://pubsonline.informs.org/doi/10.1287/mnsc.2020.3636",
        sourceType: "web",
        snippet: "A scholarly article about multihoming and platform subsidy incentives.",
        relevance: "Directly supports the seller multihoming direction.",
      },
      {
        title: "Platform Competition with Multihoming on Both Sides PDF",
        url: "https://papers.ssrn.com/sol3/Delivery.cfm/8126.pdf?abstractid=3545723",
        sourceType: "web",
        snippet: "PDF copy of the same scholarly paper.",
        relevance: "Duplicate paper family.",
      },
      {
        title: "Two-Sided Markets",
        url: "https://www.sciencedirect.com/science/article/abs/pii/S0167718704001040",
        sourceType: "web",
        snippet: "A foundational paper on two-sided market pricing.",
        relevance: "Foundational theory context.",
      },
      {
        title: "Platform report",
        url: "https://industry.example/report",
        sourceType: "industry",
        snippet: "Industry evidence about platform competition.",
        relevance: "Applied context.",
      },
    ],
  });

  assert.equal(pack.sources.length, 3);
  assert.equal(pack.sources[0].sourceType, "paper");
  assert.match(pack.sources[0].url, /pubsonline\.informs\.org/);
  assert.equal(pack.sources[1].sourceType, "paper");
  assert.match(pack.sources[1].url, /sciencedirect\.com/);
  assert.equal(pack.sources[2].sourceType, "industry");
  assert.equal(
    pack.sources.some((source) => source.url.includes("papers.ssrn.com")),
    false
  );
});

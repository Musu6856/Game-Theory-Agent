import test from "node:test";
import assert from "node:assert/strict";

import { createEvidenceSearchQueries } from "./query.ts";

test("evidence query expansion turns Chinese platform ideas into English search queries", () => {
  const queries = createEvidenceSearchQueries(
    "平台补贴与卖家多归属如何影响双边市场竞争"
  );

  assert.equal(queries[0], "平台补贴与卖家多归属如何影响双边市场竞争");
  assert.equal(queries.length >= 3, true);
  assert.equal(
    queries.some((query) =>
      query.includes("platform subsidies seller multihoming two-sided markets")
    ),
    true
  );
  assert.equal(
    queries.some((query) => query.includes("Hotelling platform competition")),
    true
  );
});

test("evidence query expansion deduplicates and caps queries", () => {
  const queries = createEvidenceSearchQueries(
    "Hotelling platform competition Hotelling platform competition"
  );

  assert.equal(new Set(queries).size, queries.length);
  assert.equal(queries.length <= 5, true);
});

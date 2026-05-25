import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReleaseReadinessReport,
  summarizeReleaseReadiness,
} from "./release-readiness.ts";

test("release readiness blocks missing production essentials", () => {
  const report = buildReleaseReadinessReport({});

  assert.equal(report.status, "blocking");
  assert.deepEqual(
    report.items
      .filter((item) => item.status === "blocking")
      .map((item) => item.key),
    [
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "DATABASE_URL",
      "MODEL_PROVIDER",
    ]
  );
});

test("release readiness treats development Clerk keys as blocking", () => {
  const report = buildReleaseReadinessReport({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
    CLERK_SECRET_KEY: "sk_test_example",
    DATABASE_URL: "postgresql://db.example/paperforge",
    DEEPSEEK_API_KEY: "sk-deepseek-secret",
  });

  assert.equal(report.status, "blocking");
  assert.deepEqual(
    report.items
      .filter((item) => item.status === "blocking")
      .map((item) => item.key),
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]
  );
});

test("release readiness reports searchable but degraded online evidence", () => {
  const report = buildReleaseReadinessReport({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
    CLERK_SECRET_KEY: "sk_live_example",
    DATABASE_URL: "postgresql://db.example/paperforge",
    DEEPSEEK_API_KEY: "sk-deepseek-secret",
  });

  assert.equal(report.status, "degraded");
  assert.deepEqual(
    report.items
      .filter((item) => item.status === "degraded")
      .map((item) => item.key),
    ["OPENALEX_API_KEY", "TAVILY_SEARCH"]
  );
});

test("release readiness passes complete production configuration without leaking secrets", () => {
  const report = buildReleaseReadinessReport({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
    CLERK_SECRET_KEY: "sk_live_should_not_appear",
    DATABASE_URL: "postgresql://db-user:db-pass@db.example/paperforge",
    DEEPSEEK_API_KEY: "sk-deepseek-should-not-appear",
    OPENALEX_API_KEY: "openalex-secret",
    TAVILY_MCP_URL: "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-secret",
  });
  const summary = summarizeReleaseReadiness(report);

  assert.equal(report.status, "ready");
  assert.equal(report.items.every((item) => item.status === "ready"), true);
  assert.doesNotMatch(summary, /should-not-appear|db-pass|tvly-secret|openalex-secret/);
  assert.match(summary, /MODEL_PROVIDER: ready/);
  assert.match(summary, /TAVILY_SEARCH: ready/);
});

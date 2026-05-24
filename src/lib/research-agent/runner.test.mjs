import test from "node:test";
import assert from "node:assert/strict";

import { runDirectionDiscoveryAgent } from "./runner.ts";

test("direction discovery agent builds an evidence-backed exploration project", async () => {
  const result = await runDirectionDiscoveryAgent(
    {
      rawIdea: "Study secondhand platform commissions and buyer subsidies",
    },
    {
      now: 1710000000000,
      id: "11111111-1111-4111-8111-111111111111",
      searchLiterature: async () => [
        {
          title: "Competition and subsidies in two-sided markets",
          url: "https://openalex.org/W1",
          sourceType: "paper",
          publishedAt: "2021",
          snippet: "A model of two-sided market pricing and platform competition.",
          relevance: "Motivates two-sided subsidy mechanisms.",
        },
      ],
      searchWeb: async () => [
        {
          title: "Public platform fee policy",
          url: "https://example.com/platform-fees",
          sourceType: "policy",
          snippet: "A public policy page about platform fees.",
          relevance: "Provides institutional context.",
        },
      ],
      complete: async (messages) => {
        const prompt = messages.map((message) => message.content).join("\n");
        assert.match(prompt, /src-1/);
        assert.match(prompt, /Competition and subsidies/);

        return JSON.stringify({
          assistantMessage: "I found evidence-backed directions.",
          directions: [
            {
              id: "d1",
              title: "Commission-subsidy competition",
              summary: "Study platform commission and buyer subsidy choices.",
              model: "Two-sided Hotelling platform competition",
              contribution: "Links subsidy policy to symbolic equilibrium.",
              recommended: true,
              evidenceSourceIds: ["src-1"],
              evidenceNote: "Grounded in two-sided market pricing evidence.",
            },
            {
              id: "d2",
              title: "Disclosure and trust",
              summary: "Study quality disclosure under platform competition.",
              model: "Signaling game",
              contribution: "Explains disclosure incentives.",
              recommended: false,
              evidenceSourceIds: ["src-2"],
              evidenceNote: "Uses public platform policy context.",
            },
            {
              id: "d3",
              title: "Seller multihoming fees",
              summary: "Study seller multihoming and fee schedules.",
              model: "Two-sided platform competition",
              contribution: "Explains multihoming pricing thresholds.",
              recommended: false,
              evidenceSourceIds: ["src-1", "src-2"],
              evidenceNote: "Combines literature and policy evidence.",
            },
          ],
        });
      },
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.evidencePack.sources.length, 2);
  assert.equal(result.agentRun.status, "completed");
  assert.deepEqual(
    result.project.researchSession?.agentRunHistory?.map((run) => run.id),
    ["agent-11111111-1111-4111-8111-111111111111"]
  );
  assert.equal(result.agentRun.trace.some((event) => event.type === "tool_result"), true);
  assert.equal(
    result.agentRun.trace.some(
      (event) =>
        event.stepId === "build-evidence-pack" &&
        event.metadata?.paperSourceCount === 1 &&
        event.metadata?.policySourceCount === 1
    ),
    true
  );
  assert.equal(result.project.researchSession?.phase, "direction");
  assert.equal(result.project.researchSession?.evidencePack?.sources.length, 2);
  assert.deepEqual(
    result.project.researchSession?.directions.map((direction) => direction.evidenceSourceIds),
    [["src-1"], ["src-2"], ["src-1", "src-2"]]
  );
});

test("direction discovery agent searches expanded evidence queries", async () => {
  const literatureQueries = [];
  const webQueries = [];
  const result = await runDirectionDiscoveryAgent(
    {
      rawIdea: "平台补贴与卖家多归属如何影响双边市场竞争",
    },
    {
      now: 1710000000000,
      id: "11111111-1111-4111-8111-111111111111",
      searchLiterature: async (query) => {
        literatureQueries.push(query);
        return [
          {
            title: `Literature for ${query}`,
            url: `https://openalex.org/${literatureQueries.length}`,
            sourceType: "paper",
            snippet: "A scholarly source about platform competition.",
            relevance: "Supports theory direction discovery.",
          },
        ];
      },
      searchWeb: async (query) => {
        webQueries.push(query);
        return [
          {
            title: `Web for ${query}`,
            url: `https://example.com/${webQueries.length}`,
            sourceType: "web",
            snippet: "A public web source about platform competition.",
            relevance: "Provides public context.",
          },
        ];
      },
      complete: async () =>
        JSON.stringify({
          assistantMessage: "I found evidence-backed directions.",
          directions: [
            {
              id: "d1",
              title: "Subsidy multihoming competition",
              summary: "Study platform subsidies and seller multihoming.",
              model: "Two-sided Hotelling platform competition",
              contribution: "Links subsidy policy to multihoming thresholds.",
              recommended: true,
              evidenceSourceIds: ["src-1", "src-2"],
              evidenceNote: "Grounded in retained evidence.",
            },
            {
              id: "d2",
              title: "Fee governance",
              summary: "Study platform fee governance.",
              model: "Two-sided platform competition",
              contribution: "Explains fee governance incentives.",
              recommended: false,
              evidenceSourceIds: ["src-3"],
              evidenceNote: "Uses retained evidence.",
            },
            {
              id: "d3",
              title: "Seller participation",
              summary: "Study seller participation.",
              model: "Hotelling competition",
              contribution: "Explains seller participation thresholds.",
              recommended: false,
              evidenceSourceIds: ["src-4"],
              evidenceNote: "Uses retained evidence.",
            },
          ],
        }),
    }
  );

  assert.equal(literatureQueries.length >= 3, true);
  assert.deepEqual(literatureQueries, webQueries);
  assert.equal(
    literatureQueries.some((query) =>
      query.includes("platform subsidies seller multihoming two-sided markets")
    ),
    true
  );
  assert.equal(result.evidencePack.sources.length > 2, true);
  assert.equal(
    result.agentRun.trace.some(
      (event) =>
        event.type === "tool_call" &&
        Array.isArray(event.metadata?.queries) &&
        event.metadata.queries.length >= 3
    ),
    true
  );
});

test("direction discovery agent falls back while preserving evidence and trace", async () => {
  const result = await runDirectionDiscoveryAgent(
    {
      rawIdea: "Study platform quality disclosure",
    },
    {
      now: 1710000000000,
      id: "11111111-1111-4111-8111-111111111111",
      searchLiterature: async () => [],
      searchWeb: async () => [],
      complete: async () => "not json",
    }
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.evidencePack.sources.length, 0);
  assert.equal(result.agentRun.status, "completed");
  assert.equal(
    result.project.researchSession?.directions.every(
      (direction) => direction.evidenceNote === "No reliable source found in this run."
    ),
    true
  );
});

test("direction discovery agent can skip online evidence when disabled", async () => {
  const result = await runDirectionDiscoveryAgent(
    {
      rawIdea: "Study platform subsidies without online lookup",
      useOnlineEvidence: false,
    },
    {
      now: 1710000000000,
      id: "11111111-1111-4111-8111-111111111111",
      searchLiterature: async () => {
        throw new Error("literature search should not be called");
      },
      searchWeb: async () => {
        throw new Error("web search should not be called");
      },
      complete: async () =>
        JSON.stringify({
          assistantMessage: "I generated directions without online evidence.",
          directions: [
            {
              id: "d1",
              title: "Offline subsidy direction",
              summary: "Use local theoretical priors.",
              model: "Two-sided Hotelling platform competition",
              contribution: "Keeps the flow usable without online sources.",
              recommended: true,
            },
          ],
        }),
    }
  );

  assert.equal(result.evidencePack.sources.length, 0);
  assert.equal(
    result.agentRun.trace.some(
      (event) =>
        event.type === "tool_result" &&
        event.metadata?.onlineEvidenceEnabled === false
    ),
    true
  );
});

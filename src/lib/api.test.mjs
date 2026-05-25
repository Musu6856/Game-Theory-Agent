import assert from "node:assert/strict";
import test from "node:test";

import { generateResearchProjectApi } from "./api.ts";

test("generateResearchProjectApi routes equilibrium solving through the agent endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
    });
  };

  try {
    await generateResearchProjectApi({
      action: "solve_equilibrium",
      rawIdea: "test idea",
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/research/agent");
  assert.equal(JSON.parse(requests[0].init.body).action, "solve_equilibrium");
});

test("generateResearchProjectApi routes property analysis through the agent endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
    });
  };

  try {
    await generateResearchProjectApi({
      action: "analyze_properties",
      rawIdea: "test idea",
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/research/agent");
  assert.equal(JSON.parse(requests[0].init.body).action, "analyze_properties");
});

test("generateResearchProjectApi routes paper drafting through the agent endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
    });
  };

  try {
    await generateResearchProjectApi({
      action: "draft_paper",
      rawIdea: "test idea",
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/research/agent");
  assert.equal(JSON.parse(requests[0].init.body).action, "draft_paper");
});

test("generateResearchProjectApi routes paper section revision through the agent endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
    });
  };

  try {
    await generateResearchProjectApi({
      action: "revise_paper_section",
      rawIdea: "test idea",
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
      sectionId: "paper-model",
      instruction: "tighten model setup",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const body = JSON.parse(requests[0].init.body);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/research/agent");
  assert.equal(body.action, "revise_paper_section");
  assert.equal(body.sectionId, "paper-model");
  assert.equal(body.instruction, "tighten model setup");
});

test("generateResearchProjectApi forwards agent resume metadata", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
    });
  };

  try {
    await generateResearchProjectApi({
      action: "solve_equilibrium",
      rawIdea: "test idea",
      project: {
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test idea",
      },
      resume: {
        runId: "agent-old-run",
        checkpointId: "checkpoint-2",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const body = JSON.parse(requests[0].init.body);
  assert.deepEqual(body.resume, {
    runId: "agent-old-run",
    checkpointId: "checkpoint-2",
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentTaskApi,
  fetchAgentTaskApi,
  generateResearchProjectApi,
  listAgentTasksForProjectApi,
  runAgentTaskApi,
} from "./api.ts";

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

test("agent task API creates a background task envelope", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({
      task: {
        id: "task-1",
        ownerId: "user-1",
        projectId: "11111111-1111-4111-8111-111111111111",
        action: "solve_equilibrium",
        status: "queued",
        input: {
          rawIdea: "test idea",
          action: "solve_equilibrium",
          projectId: "11111111-1111-4111-8111-111111111111",
        },
        checkpoints: [],
        createdAt: 1710000000000,
        updatedAt: 1710000000000,
      },
    });
  };

  try {
    await createAgentTaskApi({
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
      runtimeModelSource: {
        source: "own",
        provider: "openai-compatible",
        apiKey: "sk-test",
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests[0].url, "/api/research/agent/tasks");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    input: {
      rawIdea: "test idea",
      action: "solve_equilibrium",
      projectId: "11111111-1111-4111-8111-111111111111",
    },
  });
});

test("agent task API fetches, lists, and triggers explicit task execution", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/run")) {
      return Response.json({ task: { id: "task-1", status: "completed" } });
    }
    if (String(url).includes("?projectId=")) {
      return Response.json({ tasks: [{ id: "task-1", status: "queued" }] });
    }
    return Response.json({ task: { id: "task-1", status: "queued" } });
  };

  try {
    await fetchAgentTaskApi("task-1");
    await listAgentTasksForProjectApi("11111111-1111-4111-8111-111111111111");
    await runAgentTaskApi("task-1", {
      source: "own",
      provider: "openai-compatible",
      apiKey: "sk-test",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests[0].url, "/api/research/agent/tasks/task-1");
  assert.equal(
    requests[1].url,
    "/api/research/agent/tasks?projectId=11111111-1111-4111-8111-111111111111"
  );
  assert.equal(requests[2].url, "/api/research/agent/tasks/task-1/run");
  assert.equal(requests[2].init.method, "POST");
  assert.deepEqual(JSON.parse(requests[2].init.body), {
    runtimeModelSource: {
      source: "own",
      provider: "openai-compatible",
      apiKey: "sk-test",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    },
  });
});

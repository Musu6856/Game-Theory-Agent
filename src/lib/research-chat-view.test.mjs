import test from "node:test";
import assert from "node:assert/strict";

import { createResearchChatViewMessages } from "./research-chat-view.ts";

test("chat view suppresses a confirmed user message duplicate while reply arrives", () => {
  const confirmedMessages = [
    {
      id: "msg-user-1",
      role: "user",
      content: "那你帮我生成这些性质分析吧。",
      createdAt: 1710000000000,
    },
    {
      id: "msg-assistant-1",
      role: "assistant",
      content: "好的，已生成性质分析建议。",
      createdAt: 1710000001000,
    },
  ];
  const optimisticMessage = {
    id: "msg-optimistic",
    role: "user",
    content: "那你帮我生成这些性质分析吧。",
    createdAt: 1710000000500,
  };

  assert.deepEqual(
    createResearchChatViewMessages(confirmedMessages, optimisticMessage).map(
      (message) => message.id
    ),
    ["msg-user-1", "msg-assistant-1"]
  );
});

test("chat view shows a pending assistant bubble immediately after optimistic user message", () => {
  const optimisticMessage = {
    id: "msg-optimistic",
    role: "user",
    content: "帮我检查这条均衡推导。",
    createdAt: 1710000000000,
  };
  const pendingAssistantMessage = {
    id: "msg-pending-assistant",
    role: "assistant",
    content: "PaperForge 正在生成回复...",
    createdAt: 1710000000001,
    isPending: true,
  };

  const viewMessages = createResearchChatViewMessages(
    [],
    optimisticMessage,
    pendingAssistantMessage
  );

  assert.deepEqual(
    viewMessages.map((message) => message.id),
    ["msg-optimistic", "msg-pending-assistant"]
  );
  assert.equal(viewMessages.at(-1)?.isPending, true);
});

test("chat view keeps pending assistant under confirmed user without duplicating optimistic user", () => {
  const confirmedMessages = [
    {
      id: "msg-existing-assistant",
      role: "assistant",
      content: "当前模型已经准备好。",
      createdAt: 1710000000000,
    },
    {
      id: "msg-user-confirmed",
      role: "user",
      content: "帮我检查这条均衡推导。",
      createdAt: 1710000000001,
    },
  ];
  const optimisticMessage = {
    id: "msg-optimistic",
    role: "user",
    content: "帮我检查这条均衡推导。",
    createdAt: 1710000000002,
  };
  const pendingAssistantMessage = {
    id: "msg-pending-assistant",
    role: "assistant",
    content: "PaperForge 正在生成回复...",
    createdAt: 1710000000003,
    isPending: true,
  };

  assert.deepEqual(
    createResearchChatViewMessages(
      confirmedMessages,
      optimisticMessage,
      pendingAssistantMessage
    ).map((message) => message.id),
    ["msg-existing-assistant", "msg-user-confirmed", "msg-pending-assistant"]
  );
});

test("chat view removes pending assistant once confirmed assistant reply arrives", () => {
  const confirmedMessages = [
    {
      id: "msg-user-confirmed",
      role: "user",
      content: "帮我检查这条均衡推导。",
      createdAt: 1710000000000,
    },
    {
      id: "msg-assistant-confirmed",
      role: "assistant",
      content: "我已经检查完，主要问题在二阶条件。",
      createdAt: 1710000000001,
    },
  ];
  const optimisticMessage = {
    id: "msg-optimistic",
    role: "user",
    content: "帮我检查这条均衡推导。",
    createdAt: 1710000000002,
  };
  const pendingAssistantMessage = {
    id: "msg-pending-assistant",
    role: "assistant",
    content: "PaperForge 正在生成回复...",
    createdAt: 1710000000003,
    isPending: true,
  };

  assert.deepEqual(
    createResearchChatViewMessages(
      confirmedMessages,
      optimisticMessage,
      pendingAssistantMessage
    ).map((message) => message.id),
    ["msg-user-confirmed", "msg-assistant-confirmed"]
  );
});

test("chat view keeps equilibrium provider drafts visible when agent review exists", () => {
  const duplicatedDraft =
    "模型设定与符号均衡推导 ".repeat(20);
  const messages = [
    {
      id: "msg-assistant-model-1",
      role: "assistant",
      content: "FULL_MODEL_DRAFT",
      createdAt: 1710000000000,
    },
    {
      id: "msg-model-agent-review-1",
      role: "assistant",
      content: "我已生成模型候选，已放到右侧待审核。",
      createdAt: 1710000000001,
    },
    {
      id: "msg-start-equilibrium-provider-1",
      role: "user",
      content: "开始符号均衡求解。",
      createdAt: 1710000000002,
    },
    {
      id: "msg-equilibrium-provider-1",
      role: "assistant",
      content: "FULL_EQUILIBRIUM_DRAFT",
      createdAt: 1710000000003,
    },
    {
      id: "msg-equilibrium-agent-review-1",
      role: "assistant",
      content: `${duplicatedDraft}\n\n自检结果：我没有直接把它推进到性质分析，而是放到右侧作为待审核修改建议。`,
      createdAt: 1710000000004,
    },
    {
      id: "msg-start-analysis-provider-1",
      role: "user",
      content: "生成性质分析。",
      createdAt: 1710000000005,
    },
    {
      id: "msg-analysis-provider-1",
      role: "assistant",
      content: "FULL_PROPERTY_DRAFT",
      createdAt: 1710000000006,
    },
    {
      id: "msg-properties-agent-review-1",
      role: "assistant",
      content: "我已生成性质分析候选，已放到右侧待审核。",
      createdAt: 1710000000007,
    },
  ];

  assert.deepEqual(
    createResearchChatViewMessages(messages, null).map((message) => message.id),
    [
      "msg-model-agent-review-1",
      "msg-start-equilibrium-provider-1",
      "msg-equilibrium-provider-1",
      "msg-equilibrium-agent-review-1",
      "msg-start-analysis-provider-1",
      "msg-properties-agent-review-1",
    ]
  );
  assert.equal(
    createResearchChatViewMessages(messages, null).some((message) =>
      message.content.includes("FULL_EQUILIBRIUM_DRAFT")
    ),
    true
  );
  assert.equal(
    createResearchChatViewMessages(messages, null).some((message) =>
      message.content.includes(duplicatedDraft)
    ),
    false
  );
  assert.equal(
    createResearchChatViewMessages(messages, null).find(
      (message) => message.id === "msg-equilibrium-agent-review-1"
    )?.content,
    "自检结果：我没有直接把它推进到性质分析，而是放到右侧作为待审核修改建议。"
  );
});

test("chat view trims stale structural draft headings from old agent review messages", () => {
  const messages = [
    {
      id: "msg-equilibrium-agent-review-heading",
      role: "assistant",
      content:
        "## 模型设定与符号均衡推导\n\n1. 模型结构\n\n考虑两个AI平台A和B位于Hotelling线段[0,1]两端。\n\n自检结果：我没有直接把它推进到性质分析，而是放到右侧作为待审核修改建议。",
      createdAt: 1710000000000,
    },
    {
      id: "msg-properties-agent-review-heading",
      role: "assistant",
      content:
        "## 对称均衡下平台佣金与补贴的比较静态分析\n\n基于 Hotelling 双边市场模型，我们推导比较静态。\n\n自检结果：我没有直接把它们写入右侧性质分析资产，而是放到右侧作为待审核修改建议。",
      createdAt: 1710000000001,
    },
  ];

  const viewMessages = createResearchChatViewMessages(messages, null);

  assert.deepEqual(
    viewMessages.map((message) => message.content),
    [
      "自检结果：我没有直接把它推进到性质分析，而是放到右侧作为待审核修改建议。",
      "自检结果：我没有直接把它们写入右侧性质分析资产，而是放到右侧作为待审核修改建议。",
    ]
  );
  assert.equal(
    viewMessages.some((message) => message.content.startsWith("## ")),
    false
  );
});

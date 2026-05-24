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

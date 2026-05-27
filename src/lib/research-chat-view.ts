import type { ResearchSessionMessage } from "./types";

export type ResearchChatViewMessage = ResearchSessionMessage & {
  isPending?: boolean;
};

export function createResearchChatViewMessages(
  messages: ResearchSessionMessage[],
  optimisticMessage: ResearchSessionMessage | null,
  pendingAssistantMessage: ResearchChatViewMessage | null = null
): ResearchChatViewMessage[] {
  const visibleMessages = normalizeAgentReviewMessages(
    hideSupersededAgentProviderDrafts(messages)
  );

  if (!optimisticMessage && !pendingAssistantMessage) return visibleMessages;

  const confirmedUserIndex = optimisticMessage
    ? findLastMatchingMessageIndex(visibleMessages, optimisticMessage)
    : -1;

  if (confirmedUserIndex >= 0) {
    const assistantAlreadyArrived = visibleMessages
      .slice(confirmedUserIndex + 1)
      .some((message) => message.role === "assistant");

    if (assistantAlreadyArrived || !pendingAssistantMessage) {
      return visibleMessages;
    }

    return [
      ...visibleMessages.slice(0, confirmedUserIndex + 1),
      pendingAssistantMessage,
      ...visibleMessages.slice(confirmedUserIndex + 1),
    ];
  }

  const viewMessages: ResearchChatViewMessage[] = [...visibleMessages];
  if (optimisticMessage) viewMessages.push(optimisticMessage);
  if (pendingAssistantMessage) viewMessages.push(pendingAssistantMessage);
  return viewMessages;
}

function hideSupersededAgentProviderDrafts(
  messages: ResearchSessionMessage[]
): ResearchSessionMessage[] {
  return messages.filter((message, index) => {
    if (isPropertyProviderDraft(message)) {
      return !hasLaterMessage(
        messages,
        index,
        (laterMessage) =>
          laterMessage.role === "assistant" &&
          laterMessage.id.startsWith("msg-properties-agent-review-")
      );
    }

    if (isModelProviderDraft(message)) {
      return !hasLaterMessage(
        messages,
        index,
        (laterMessage) =>
          laterMessage.role === "assistant" &&
          (laterMessage.id.startsWith("msg-model-agent-review-") ||
            laterMessage.id.startsWith("msg-model-review-"))
      );
    }

    return true;
  });
}

function hasLaterMessage(
  messages: ResearchSessionMessage[],
  currentIndex: number,
  predicate: (message: ResearchSessionMessage) => boolean
) {
  return messages.slice(currentIndex + 1).some(predicate);
}

function isPropertyProviderDraft(message: ResearchSessionMessage) {
  return (
    message.role === "assistant" &&
    message.id.startsWith("msg-analysis-provider-")
  );
}

function isModelProviderDraft(message: ResearchSessionMessage) {
  return (
    message.role === "assistant" &&
    (message.id.startsWith("msg-model-provider-") ||
      message.id.startsWith("msg-assistant-model-") ||
      message.id.startsWith("msg-provider-model-"))
  );
}

function normalizeAgentReviewMessages(
  messages: ResearchSessionMessage[]
): ResearchChatViewMessage[] {
  return messages.map((message) => {
    if (!isAgentReviewMessage(message)) return message;
    return normalizeStaleAgentReviewMessage(message);
  });
}

function normalizeStaleAgentReviewMessage(
  message: ResearchSessionMessage
): ResearchChatViewMessage {
  const parts = message.content.split(/\n\s*\n/);
  const leadingDraft = parts[0]?.trim() ?? "";
  if (!isStructuralDraftPrefix(leadingDraft)) return message;

  const reviewOnly = extractReviewNote(parts.slice(1));
  if (!reviewOnly) return message;

  return {
    ...message,
    content: reviewOnly,
  };
}

function isStructuralDraftPrefix(leadingDraft: string) {
  return leadingDraft.length >= 220 || /^#{1,6}\s/.test(leadingDraft);
}

function extractReviewNote(parts: string[]) {
  const reviewIndex = parts.findIndex((part) => isAgentReviewNote(part.trim()));
  const reviewParts = reviewIndex >= 0 ? parts.slice(reviewIndex) : parts;
  return reviewParts.join("\n\n").trim();
}

function isAgentReviewNote(part: string) {
  return (
    part.startsWith("自检结果") ||
    part.includes("待审核修改建议") ||
    part.includes("没有直接把") ||
    part.includes("我已生成")
  );
}

function isAgentReviewMessage(message: ResearchSessionMessage) {
  return (
    message.role === "assistant" &&
    (message.id.startsWith("msg-model-agent-review-") ||
      message.id.startsWith("msg-equilibrium-agent-review-") ||
      message.id.startsWith("msg-properties-agent-review-") ||
      message.id.startsWith("msg-paper-agent-review-"))
  );
}

function normalizeMessageContent(content: string) {
  return content.trim().replace(/\s+/g, " ");
}

function findLastMatchingMessageIndex(
  messages: ResearchSessionMessage[],
  targetMessage: ResearchSessionMessage
) {
  const targetContent = normalizeMessageContent(targetMessage.content);
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== targetMessage.role) continue;
    if (normalizeMessageContent(message.content) === targetContent) {
      return index;
    }
  }
  return -1;
}

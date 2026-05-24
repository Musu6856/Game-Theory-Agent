import type { ResearchSessionMessage } from "./types";

export type ResearchChatViewMessage = ResearchSessionMessage & {
  isPending?: boolean;
};

export function createResearchChatViewMessages(
  messages: ResearchSessionMessage[],
  optimisticMessage: ResearchSessionMessage | null,
  pendingAssistantMessage: ResearchChatViewMessage | null = null
): ResearchChatViewMessage[] {
  if (!optimisticMessage && !pendingAssistantMessage) return messages;

  const confirmedUserIndex = optimisticMessage
    ? findLastMatchingMessageIndex(messages, optimisticMessage)
    : -1;

  if (confirmedUserIndex >= 0) {
    const assistantAlreadyArrived = messages
      .slice(confirmedUserIndex + 1)
      .some((message) => message.role === "assistant");

    if (assistantAlreadyArrived || !pendingAssistantMessage) {
      return messages;
    }

    return [
      ...messages.slice(0, confirmedUserIndex + 1),
      pendingAssistantMessage,
      ...messages.slice(confirmedUserIndex + 1),
    ];
  }

  const viewMessages: ResearchChatViewMessage[] = [...messages];
  if (optimisticMessage) viewMessages.push(optimisticMessage);
  if (pendingAssistantMessage) viewMessages.push(pendingAssistantMessage);
  return viewMessages;
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

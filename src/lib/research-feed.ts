import type { ResearchSession, ResearchSessionMessage } from "./types";

export type ResearchFeedItem = {
  message: ResearchSessionMessage;
  showDirections: boolean;
  showPhaseAction: boolean;
};

export function getResearchFeedItems(
  session: ResearchSession
): ResearchFeedItem[] {
  const firstAssistantIndex = session.messages.findIndex(
    (message) => message.role === "assistant"
  );
  const phaseActionIndex =
    session.phase === "direction" ? -1 : findLastAssistantIndex(session.messages);

  return session.messages.map((message, index) => ({
    message,
    showDirections: index === firstAssistantIndex,
    showPhaseAction: index === phaseActionIndex,
  }));
}

function findLastAssistantIndex(messages: ResearchSessionMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "assistant") {
      return index;
    }
  }

  return -1;
}

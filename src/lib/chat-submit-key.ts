export type ChatSubmitKeyEvent = {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
};

export function shouldSubmitChatDraftFromKey(event: ChatSubmitKeyEvent) {
  if (event.key !== "Enter") return false;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  return !(event.isComposing || event.nativeEvent?.isComposing);
}

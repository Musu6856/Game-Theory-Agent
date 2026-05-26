import test from "node:test";
import assert from "node:assert/strict";

import { shouldSubmitChatDraftFromKey } from "./chat-submit-key.ts";

test("submits chat draft on plain Enter", () => {
  assert.equal(shouldSubmitChatDraftFromKey({ key: "Enter" }), true);
});

test("keeps Shift+Enter available for new lines", () => {
  assert.equal(
    shouldSubmitChatDraftFromKey({ key: "Enter", shiftKey: true }),
    false
  );
});

test("does not submit while an input method is composing", () => {
  assert.equal(
    shouldSubmitChatDraftFromKey({
      key: "Enter",
      nativeEvent: { isComposing: true },
    }),
    false
  );
});

test("ignores non-Enter keys", () => {
  assert.equal(shouldSubmitChatDraftFromKey({ key: "a" }), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("./pane-splitter.tsx", import.meta.url),
  "utf8"
);

test("pane splitter exposes separator semantics for orientation", () => {
  assert.match(source, /role="separator"/);
  assert.match(source, /aria-orientation="vertical"/);
});

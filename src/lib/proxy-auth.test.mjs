import test from "node:test";
import assert from "node:assert/strict";
import { shouldBypassClerkProxy } from "./proxy-auth.ts";

test("development guest proxy bypasses Clerk middleware", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    assert.equal(shouldBypassClerkProxy(), true);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("non-development proxy does not bypass Clerk middleware", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    assert.equal(shouldBypassClerkProxy(), false);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

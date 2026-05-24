import test from "node:test";
import assert from "node:assert/strict";

import {
  assertPublicHttpUrl,
  isPrivateIpAddress,
  isPublicHttpUrl,
} from "./guards.ts";

test("URL guard accepts public http and https URLs", () => {
  assert.equal(isPublicHttpUrl("https://api.openalex.org/works"), true);
  assert.equal(isPublicHttpUrl("http://export.arxiv.org/api/query"), true);
});

test("URL guard blocks non-http protocols and local network targets", () => {
  const blockedUrls = [
    "file:///etc/passwd",
    "ftp://example.com/file",
    "https://localhost:3000",
    "https://127.0.0.1/admin",
    "https://10.0.0.5/secret",
    "https://172.16.2.4/secret",
    "https://192.168.1.10/secret",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/",
    "https://metadata.google.internal/computeMetadata/v1",
  ];

  for (const url of blockedUrls) {
    assert.equal(isPublicHttpUrl(url), false, url);
    assert.throws(() => assertPublicHttpUrl(url), /public http/i, url);
  }
});

test("private IP detection covers reserved IPv4 and IPv6 ranges", () => {
  assert.equal(isPrivateIpAddress("127.0.0.1"), true);
  assert.equal(isPrivateIpAddress("10.1.2.3"), true);
  assert.equal(isPrivateIpAddress("172.31.255.255"), true);
  assert.equal(isPrivateIpAddress("192.168.0.8"), true);
  assert.equal(isPrivateIpAddress("169.254.169.254"), true);
  assert.equal(isPrivateIpAddress("::1"), true);
  assert.equal(isPrivateIpAddress("fc00::1"), true);
  assert.equal(isPrivateIpAddress("fe80::1"), true);
  assert.equal(isPrivateIpAddress("8.8.8.8"), false);
  assert.equal(isPrivateIpAddress("2606:4700:4700::1111"), false);
});

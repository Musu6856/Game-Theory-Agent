import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
]);

export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const host = normalizeHost(url.hostname);
    if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost")) {
      return false;
    }

    if (isIP(host) && isPrivateIpAddress(host)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function assertPublicHttpUrl(value: string): URL {
  if (!isPublicHttpUrl(value)) {
    throw new Error("URL must be a public http or https URL.");
  }

  return new URL(value);
}

export async function assertPublicHttpUrlWithDns(
  value: string,
  resolveAddresses: (
    host: string
  ) => Promise<Array<{ address: string }>> = resolveHostAddresses
): Promise<URL> {
  const url = assertPublicHttpUrl(value);
  const host = normalizeHost(url.hostname);

  if (isIP(host)) {
    return url;
  }

  const records = await resolveAddresses(host);
  if (records.some((record) => isPrivateIpAddress(record.address))) {
    throw new Error("URL must resolve to public addresses.");
  }

  return url;
}

export function isPrivateIpAddress(address: string): boolean {
  const normalized = normalizeHost(address);
  const version = isIP(normalized);

  if (version === 4) {
    const parts = normalized.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
      return false;
    }

    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }

  if (version === 6) {
    if (normalized === "::" || normalized === "::1") {
      return true;
    }

    if (normalized.startsWith("::ffff:")) {
      return isPrivateIpAddress(normalized.slice("::ffff:".length));
    }

    const firstHextet = normalized.split(":")[0] ?? "";
    const numeric = Number.parseInt(firstHextet, 16);
    if (!Number.isNaN(numeric)) {
      if ((numeric & 0xfe00) === 0xfc00) return true;
      if ((numeric & 0xffc0) === 0xfe80) return true;
    }
  }

  return false;
}

async function resolveHostAddresses(host: string) {
  return lookup(host, { all: true, verbatim: true });
}

function normalizeHost(host: string) {
  return host.replace(/^\[(.*)\]$/, "$1").toLowerCase();
}

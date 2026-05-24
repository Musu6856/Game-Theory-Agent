import type {
  ModelSourceMetadata,
  ModelSourceProvider,
  ModelSourceSettings,
} from "./types";

export const MODEL_SOURCE_STORAGE_KEY = "paperforge:model-source:v1";
export const MODEL_SOURCE_CONFIGURED_KEY =
  "paperforge:model-source-configured:v1";
export const MODEL_SOURCE_CONFIGURED_EVENT =
  "paperforge:model-source-setup-change";
export const ONLINE_EVIDENCE_STORAGE_KEY = "paperforge:online-evidence:v1";
export const ONLINE_EVIDENCE_CHANGED_EVENT =
  "paperforge:online-evidence-change";

const COMPATIBLE_PROVIDERS = new Set<ModelSourceProvider>([
  "openai-compatible",
]);

export function normalizeModelSourceSettings(
  value: Partial<ModelSourceSettings> | null | undefined
): ModelSourceSettings {
  const input = (value ?? {}) as Partial<OwnModelSourceInput>;
  const source = input.source ?? "paperforge";

  if (source !== "paperforge" && source !== "own") {
    throw new Error("Unknown model source.");
  }

  if (source === "paperforge") {
    return { source };
  }

  const provider = input.provider;
  if (!provider) {
    throw new Error("Model provider is required for own model source.");
  }
  if (!isModelSourceProvider(provider)) {
    throw new Error(
      "Only OpenAI and OpenAI-compatible model providers are supported."
    );
  }
  const apiKey = trimOptional(input.apiKey);
  if (!apiKey) {
    throw new Error("API key is required for own model source.");
  }
  const model = trimOptional(input.model);
  if (!model) {
    throw new Error("Model is required for own model source.");
  }

  const baseUrl = trimEndpoint(input.baseUrl);
  if (baseUrl) {
    validateModelSourceBaseUrl(baseUrl);
  }

  const normalized: ModelSourceSettings = {
    source,
    provider,
    apiKey,
    model,
  };

  if (COMPATIBLE_PROVIDERS.has(provider)) {
    if (!baseUrl) {
      throw new Error("Base URL is required for compatible model provider.");
    }
    normalized.baseUrl = baseUrl;
  } else if (baseUrl) {
    normalized.baseUrl = baseUrl;
  }

  return normalized;
}

export function validateModelSourceBaseUrl(baseUrl: string): void {
  const url = new URL(baseUrl);

  if (url.protocol !== "https:") {
    throw new Error("Base URL must use HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("Base URL must not include credentials.");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new Error("Base URL host is required.");
  }

  if (isBlockedHostname(hostname) || isBlockedIpAddress(hostname)) {
    throw new Error("Base URL cannot target localhost or private addresses.");
  }
}

export function parseStoredModelSourceSettings(
  stored: string | null
): ModelSourceSettings {
  if (!stored) {
    return { source: "paperforge" };
  }

  try {
    return normalizeModelSourceSettings(JSON.parse(stored));
  } catch {
    return { source: "paperforge" };
  }
}

export function hasCompletedModelSourceSetup(stored: string | null): boolean {
  return stored === "1" || stored === "true";
}

export function getStartResearchDestination({
  setupCompleted,
  hasExistingProjects = false,
}: {
  setupCompleted: boolean;
  hasExistingProjects?: boolean;
}): "/launch" | "/research" {
  return setupCompleted || hasExistingProjects ? "/research" : "/launch";
}

export function markModelSourceSetupCompleted(storage: Storage): void {
  storage.setItem(MODEL_SOURCE_CONFIGURED_KEY, "1");
}

export function parseStoredOnlineEvidenceEnabled(stored: string | null): boolean {
  return stored !== "0" && stored !== "false";
}

export function setOnlineEvidenceEnabled(
  storage: Storage,
  enabled: boolean
): void {
  storage.setItem(ONLINE_EVIDENCE_STORAGE_KEY, enabled ? "1" : "0");
}

type OwnModelSourceInput = {
  source: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export function getModelSourceMetadata(
  settings: ModelSourceSettings
): ModelSourceMetadata {
  const normalized = normalizeModelSourceSettings(settings);

  if (normalized.source === "paperforge") {
    return { source: "paperforge" };
  }

  const metadata: ModelSourceMetadata = {
    source: "own",
    provider: normalized.provider,
    model: normalized.model,
    hasBrowserApiKey: true,
  };

  if (normalized.baseUrl) metadata.baseUrl = normalized.baseUrl;

  return metadata;
}

export function getRuntimeModelSourceSettings(
  settings: ModelSourceSettings
): ModelSourceSettings | undefined {
  const normalized = normalizeModelSourceSettings(settings);
  return normalized.source === "own" ? normalized : undefined;
}

function isModelSourceProvider(value: string): value is ModelSourceProvider {
  return (
    value === "openai" ||
    value === "openai-compatible"
  );
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function trimEndpoint(value: unknown): string | undefined {
  const trimmed = trimOptional(value);
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "");
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[(.*)\]$/, "$1").trim().toLowerCase();
}

function isBlockedHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal" ||
    hostname === "169.254.169.254"
  );
}

function isBlockedIpAddress(hostname: string) {
  const ipVersion = parseIpVersion(hostname);
  if (!ipVersion) return false;

  if (ipVersion === 4) {
    return isBlockedIpv4(hostname);
  }

  return isBlockedIpv6(hostname);
}

function parseIpVersion(value: string) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return 4;
  if (value.includes(":")) return 6;
  return 0;
}

function isBlockedIpv4(value: string) {
  const octets = value.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127 || a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;

  return false;
}

function isBlockedIpv6(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe90:")) return true;
  if (normalized.startsWith("fea0:") || normalized.startsWith("feb0:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  if (normalized.startsWith("::ffff:")) {
    return isBlockedIpv4(normalized.slice("::ffff:".length));
  }

  return false;
}

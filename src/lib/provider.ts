import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { validateModelSourceBaseUrl } from "./model-source.ts";
import type { ModelSourceSettings } from "./types";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const MIMO_BASE_URL = "https://api.xiaomimimo.com/v1";
const MIMO_MODEL = "mimo-v2.5-pro";
const DEFAULT_BASE_URL = DEEPSEEK_BASE_URL;
const DEFAULT_MODEL = DEEPSEEK_MODEL;
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-5.2";
const OFFICIAL_PROVIDER_HOSTS = new Set([
  "api.deepseek.com",
  "api.openai.com",
  "api.xiaomimimo.com",
]);

export type ProviderConfig = {
  apiKey?: string;
  baseUrl: string;
  model: string;
};

export type ProviderChatMessage = {
  role: "developer" | "system" | "user" | "assistant";
  content: string;
};

export type ProviderChatCompletionPayload = {
  model: string;
  messages: ProviderChatMessage[];
  max_tokens: number;
  temperature: number;
  top_p: number;
  stream: false;
  stop: null;
  frequency_penalty: number;
  presence_penalty: number;
  thinking: {
    type: "disabled";
  };
  response_format?: {
    type: "json_object";
  };
};

type ProviderChatOptions = {
  messages: ProviderChatMessage[];
  maxCompletionTokens: number;
  responseFormat?: "json_object";
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export function getProviderConfig() {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL || DEEPSEEK_MODEL,
    };
  }

  if (process.env.OPENAI_COMPATIBLE_API_KEY) {
    return {
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || DEFAULT_BASE_URL,
      model: process.env.OPENAI_COMPATIBLE_MODEL || DEFAULT_MODEL,
    };
  }

  if (process.env.MIMO_API_KEY) {
    return {
      apiKey: process.env.MIMO_API_KEY,
      baseUrl: process.env.MIMO_BASE_URL || MIMO_BASE_URL,
      model: process.env.MIMO_MODEL || MIMO_MODEL,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL || OPENAI_MODEL,
    };
  }

  if (process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_COMPATIBLE_MODEL) {
    return {
      apiKey: undefined,
      baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || DEFAULT_BASE_URL,
      model: process.env.OPENAI_COMPATIBLE_MODEL || DEFAULT_MODEL,
    };
  }

  if (process.env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_MODEL) {
    return {
      apiKey: undefined,
      baseUrl: process.env.DEEPSEEK_BASE_URL || DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL || DEEPSEEK_MODEL,
    };
  }

  if (process.env.MIMO_BASE_URL || process.env.MIMO_MODEL) {
    return {
      apiKey: undefined,
      baseUrl: process.env.MIMO_BASE_URL || MIMO_BASE_URL,
      model: process.env.MIMO_MODEL || MIMO_MODEL,
    };
  }

  if (process.env.OPENAI_BASE_URL || process.env.OPENAI_MODEL) {
    return {
      apiKey: undefined,
      baseUrl: process.env.OPENAI_BASE_URL || OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL || OPENAI_MODEL,
    };
  }

  return {
    apiKey: undefined,
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
  };
}

export function getProviderConfigForModelSource(
  modelSource?: ModelSourceSettings
): ProviderConfig {
  if (!modelSource || modelSource.source === "paperforge") {
    return getProviderConfig();
  }

  if (
    modelSource.provider !== "openai" &&
    modelSource.provider !== "openai-compatible"
  ) {
    throw new Error(
      "This research generation route currently supports OpenAI-compatible model sources only."
    );
  }

  return {
    apiKey: modelSource.apiKey,
    baseUrl:
      modelSource.baseUrl ??
      (modelSource.provider === "openai"
        ? "https://api.openai.com/v1"
        : DEFAULT_BASE_URL),
    model: modelSource.model,
  };
}

export function createChatCompletionPayload(
  provider: Pick<ProviderConfig, "model">,
  options: Pick<
    ProviderChatOptions,
    "messages" | "maxCompletionTokens" | "responseFormat" | "temperature" | "topP"
  >
): ProviderChatCompletionPayload {
  return {
    model: provider.model,
    messages: options.messages.map((message) => ({
      ...message,
      role: message.role === "developer" ? "system" : message.role,
    })),
    max_tokens: options.maxCompletionTokens,
    temperature: options.temperature ?? 1.0,
    top_p: options.topP ?? 0.95,
    stream: false,
    stop: null,
    frequency_penalty: 0,
    presence_penalty: 0,
    thinking: {
      type: "disabled",
    },
    ...(options.responseFormat
      ? {
          response_format: {
            type: options.responseFormat,
          },
        }
      : {}),
  };
}

export function extractChatCompletionContent(data: unknown) {
  const response = data as ChatCompletionResponse;
  return response.choices?.[0]?.message?.content?.trim() ?? "";
}

export function createProviderRequestHeaders(
  provider: Pick<ProviderConfig, "apiKey" | "baseUrl">
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!provider.apiKey) {
    return headers;
  }

  if (provider.baseUrl.includes("api.xiaomimimo.com")) {
    headers["api-key"] = provider.apiKey;
  } else {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  return headers;
}

export async function completeProviderChat(
  provider: ProviderConfig,
  options: ProviderChatOptions
) {
  if (!provider.apiKey) {
    throw new Error("Provider API key is missing.");
  }

  const fetchImpl = options.fetch ?? fetch;
  await validateProviderBaseUrl(provider.baseUrl, !options.fetch);
  const upstream = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    signal: options.signal,
    headers: createProviderRequestHeaders(provider),
    body: JSON.stringify(createChatCompletionPayload(provider, options)),
  });

  if (!upstream.ok) {
    throw new ProviderHttpError(upstream);
  }

  const data = (await upstream.json()) as unknown;
  return extractChatCompletionContent(data);
}

export class ProviderHttpError extends Error {
  status: number;
  statusText: string;

  constructor(response: Response) {
    super(`Provider request failed with ${response.status}`);
    this.name = "ProviderHttpError";
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

export async function validateProviderBaseUrl(
  baseUrl: string,
  resolveHost: boolean,
  resolveAddresses: (host: string) => Promise<Array<{ address: string }>> =
    resolveProviderHostAddresses
) {
  validateModelSourceBaseUrl(baseUrl);

  if (!resolveHost) {
    return;
  }

  const url = new URL(baseUrl);
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();

  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new Error("Provider base URL cannot target localhost or private addresses.");
    }
    return;
  }

  if (OFFICIAL_PROVIDER_HOSTS.has(host)) {
    return;
  }

  const addresses = await resolveAddresses(host);
  if (addresses.some((record) => isPrivateAddress(record.address))) {
    throw new Error("Provider base URL cannot resolve to private addresses.");
  }
}

async function resolveProviderHostAddresses(host: string) {
  return lookup(host, { all: true, verbatim: true });
}

function isPrivateAddress(address: string) {
  const normalized = address.replace(/^\[(.*)\]$/, "$1").toLowerCase();
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
      return isPrivateAddress(normalized.slice("::ffff:".length));
    }

    const firstHextet = normalized.split(":")[0]?.toLowerCase() ?? "";
    const numeric = Number.parseInt(firstHextet, 16);
    if (!Number.isNaN(numeric)) {
      if ((numeric & 0xfe00) === 0xfc00) return true;
      if ((numeric & 0xffc0) === 0xfe80) return true;
    }
  }

  return false;
}

export function jsonError(error: string, status: number, code: string) {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function providerErrorResponse(response: Response) {
  const body = await response.text();
  console.error("Provider API error:", {
    status: response.status,
    statusText: response.statusText,
    body,
  });

  if (response.status === 401 || response.status === 403) {
    return jsonError(
      "AI provider authentication failed. Check your API key in the environment.",
      502,
      "provider_auth_failed"
    );
  }

  if (response.status === 429) {
    return jsonError(
      "AI provider rate limit reached. Please try again later.",
      429,
      "provider_rate_limited"
    );
  }

  return jsonError(
    "AI provider request failed. Check the configured model and account access.",
    502,
    "provider_request_failed"
  );
}

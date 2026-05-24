import type { ProviderHealthResult } from "./api";
import type { ModelSourceProvider } from "./types";
import type { ModelSourceSettings } from "./types";

export type ModelSourceUiSummary = {
  label: string;
  detail: string;
};

export function describeModelSourceForUi(
  settings: ModelSourceSettings,
  health?: ProviderHealthResult | null
): ModelSourceUiSummary {
  if (settings.source === "own") {
    return {
      label: `自有模型：${settings.model}`,
      detail: [
        formatProviderKind(settings.provider),
        formatEndpointHost(
          settings.baseUrl ??
            (settings.provider === "openai"
              ? "https://api.openai.com/v1"
              : "")
        ),
        "API key 已保存在浏览器",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  if (health?.provider.model) {
    return {
      label: `默认模型：${health.provider.model}`,
      detail: [
        formatEndpointHost(health.provider.baseUrl),
        health.ok ? "已检测可用" : "检测未通过",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  return {
    label: "默认模型：待检测",
    detail: "打开设置并点击检测连通，可查看服务端实际模型和 Base URL。",
  };
}

function formatProviderKind(provider: ModelSourceProvider) {
  return provider === "openai" ? "OpenAI" : "OpenAI-compatible";
}

function formatEndpointHost(endpoint: string) {
  if (!endpoint) return "";

  try {
    return new URL(endpoint).hostname;
  } catch {
    return endpoint.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

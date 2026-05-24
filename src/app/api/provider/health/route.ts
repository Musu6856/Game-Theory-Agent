import { checkProviderConnectivity } from "@/lib/provider-health";
import {
  getProviderConfig,
  getProviderConfigForModelSource,
  jsonError,
} from "@/lib/provider";
import { getRequestUserId } from "@/lib/server-auth";
import { normalizeModelSourceSettings } from "@/lib/model-source";

export async function GET() {
  return runProviderHealthCheck();
}

export async function POST(request: Request) {
  let modelSource: unknown;

  try {
    const body = (await request.json()) as { modelSource?: unknown };
    modelSource = body.modelSource;
  } catch {
    return jsonError("Invalid JSON body", 400, "invalid_json");
  }

  return runProviderHealthCheck(modelSource);
}

async function runProviderHealthCheck(modelSource?: unknown) {
  const userId = await getRequestUserId();

  if (!userId) {
    return jsonError("Unauthorized", 401, "unauthorized");
  }

  const { provider, unsupportedReason, error } = getProviderFromModelSource(
    modelSource
  );

  if (error) {
    return jsonError(error, 400, "invalid_provider_health_request");
  }

  const chat = await checkProviderConnectivity(provider, { unsupportedReason });

  if (!chat.ok) {
    return Response.json({ ...chat, checks: { chat, json: null } });
  }

  const json = await checkProviderConnectivity(provider, {
    jsonMode: true,
    unsupportedReason,
  });
  return Response.json({
    ...json,
    ok: chat.ok && json.ok,
    code: chat.ok && json.ok ? "connected" : json.code,
    message:
      chat.ok && json.ok
        ? "默认模型连通正常，研究生成 JSON 模式可用。"
        : json.message,
    latencyMs:
      (chat.latencyMs ?? 0) + (json.latencyMs ?? 0),
    checks: { chat, json },
  });
}

function getProviderFromModelSource(value: unknown) {
  if (!value) {
    return { provider: getProviderConfig() };
  }

  try {
    const settings = normalizeModelSourceSettings(value);
    return {
      provider: getProviderConfigForModelSource(settings),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("OpenAI-compatible")) {
      return {
        provider: {
          baseUrl: "",
          model: "",
        },
        unsupportedReason: error.message,
      };
    }

    return {
      provider: getProviderConfig(),
      error:
        error instanceof Error
          ? error.message
          : "Invalid model source settings.",
    };
  }
}

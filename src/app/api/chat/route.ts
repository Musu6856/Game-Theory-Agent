import { getRequestUserId } from "@/lib/server-auth";
import {
  createProviderRequestHeaders,
  getProviderConfig,
  jsonError,
  providerErrorResponse,
} from "@/lib/provider";
import { checkRateLimit } from "@/lib/rate-limit";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function extractDelta(line: string) {
  if (!line.startsWith("data: ")) return "";

  const data = line.slice(6).trim();
  if (!data || data === "[DONE]") return "";

  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content || "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getRequestUserId();
    if (!userId) {
      return jsonError("Unauthorized", 401, "unauthorized");
    }

    const limit = checkRateLimit(userId);
    if (!limit.ok) {
      return jsonError(
        `Too many requests. Try again in ${limit.retryAfter}s.`,
        429,
        "rate_limited"
      );
    }

    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return jsonError("Invalid messages", 400, "invalid_messages");
    }

    const provider = getProviderConfig();

    if (!provider.apiKey) {
      return jsonError(
        "AI service is not configured. Set MIMO_API_KEY, OPENAI_COMPATIBLE_API_KEY, DEEPSEEK_API_KEY, or OPENAI_API_KEY in the environment.",
        503,
        "missing_provider_api_key"
      );
    }

    const upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: createProviderRequestHeaders(provider),
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 4096,
        stream: true,
        messages: [
          {
            role: "system",
            content:
              "你是一个博弈论研究助手，帮助研究者构建和撰写博弈论模型。用中文回复。使用 LaTeX 格式（$...$）表示数学符号。",
          },
          ...messages.map((message: ChatMessage) => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
          })),
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      return providerErrorResponse(upstream);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();
    let buffer = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const delta = extractDelta(line.trim());
              if (delta) controller.enqueue(encoder.encode(delta));
            }
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return jsonError("Internal server error", 500, "internal_error");
  }
}

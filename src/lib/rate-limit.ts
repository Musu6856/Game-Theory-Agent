const WINDOW_MS = 60_000;
const MAX_REQUESTS = 15;

const hits = new Map<string, number[]>();

export function checkRateLimit(userId: string): {
  ok: boolean;
  retryAfter?: number;
} {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const timestamps = hits.get(userId) ?? [];
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= MAX_REQUESTS) {
    const oldest = recent[0];
    return { ok: false, retryAfter: Math.ceil((oldest + WINDOW_MS - now) / 1000) };
  }

  recent.push(now);
  hits.set(userId, recent);
  return { ok: true };
}

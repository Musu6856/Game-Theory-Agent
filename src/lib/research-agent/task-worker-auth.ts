export type AgentTaskWorkerAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export function authenticateAgentTaskWorkerRequest({
  request,
  secret,
  secrets,
}: {
  request: Request;
  secret?: string;
  secrets?: Array<string | undefined>;
}): AgentTaskWorkerAuthResult {
  const configuredSecrets = [secret, ...(secrets ?? [])]
    .map((item) => item?.trim() ?? "")
    .filter(Boolean);
  if (configuredSecrets.length === 0) {
    return {
      ok: false,
      status: 503,
      code: "worker_secret_not_configured",
      message: "Agent task worker secret is not configured",
    };
  }

  const providedSecret = getWorkerSecretFromRequest(request);
  if (!providedSecret) {
    return {
      ok: false,
      status: 401,
      code: "worker_secret_required",
      message: "Agent task worker secret is required",
    };
  }

  if (!configuredSecrets.includes(providedSecret)) {
    return {
      ok: false,
      status: 403,
      code: "worker_secret_invalid",
      message: "Agent task worker secret is invalid",
    };
  }

  return { ok: true };
}

function getWorkerSecretFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-agent-worker-secret")?.trim() ?? "";
}

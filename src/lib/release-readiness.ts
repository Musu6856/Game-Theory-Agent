export type ReleaseReadinessStatus =
  | "ready"
  | "degraded"
  | "blocking"
  | "optional";

export type ReleaseReadinessItem = {
  key: string;
  label: string;
  status: ReleaseReadinessStatus;
  message: string;
};

export type ReleaseReadinessReport = {
  status: Exclude<ReleaseReadinessStatus, "optional">;
  items: ReleaseReadinessItem[];
};

type ReleaseEnvironment = Record<string, string | undefined>;

const MODEL_PROVIDER_KEYS = [
  "DEEPSEEK_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
  "MIMO_API_KEY",
  "OPENAI_API_KEY",
] as const;

export function buildReleaseReadinessReport(
  env: ReleaseEnvironment = process.env
): ReleaseReadinessReport {
  const items: ReleaseReadinessItem[] = [
    checkClerkPublishableKey(env),
    checkClerkSecretKey(env),
    checkDatabaseUrl(env),
    checkModelProvider(env),
    checkOpenAlex(env),
    checkTavilySearch(env),
  ];

  return {
    status: getOverallStatus(items),
    items,
  };
}

export function summarizeReleaseReadiness(report: ReleaseReadinessReport) {
  return [
    `release-readiness: ${report.status}`,
    ...report.items.map((item) => `${item.key}: ${item.status} - ${item.message}`),
  ].join("\n");
}

function checkClerkPublishableKey(env: ReleaseEnvironment): ReleaseReadinessItem {
  const value = readEnv(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (!value) {
    return blockingItem(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "Clerk publishable key",
      "Missing Clerk publishable key."
    );
  }

  if (!value.startsWith("pk_live_")) {
    return blockingItem(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "Clerk publishable key",
      "Use a Clerk production publishable key for the small-group release."
    );
  }

  return readyItem(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "Clerk publishable key",
    "Clerk production publishable key is configured."
  );
}

function checkClerkSecretKey(env: ReleaseEnvironment): ReleaseReadinessItem {
  const value = readEnv(env, "CLERK_SECRET_KEY");
  if (!value) {
    return blockingItem(
      "CLERK_SECRET_KEY",
      "Clerk secret key",
      "Missing Clerk secret key."
    );
  }

  if (!value.startsWith("sk_live_")) {
    return blockingItem(
      "CLERK_SECRET_KEY",
      "Clerk secret key",
      "Use a Clerk production secret key for the small-group release."
    );
  }

  return readyItem(
    "CLERK_SECRET_KEY",
    "Clerk secret key",
    "Clerk production secret key is configured."
  );
}

function checkDatabaseUrl(env: ReleaseEnvironment): ReleaseReadinessItem {
  const value = readEnv(env, "DATABASE_URL");
  if (!value || value === "postgresql://...") {
    return blockingItem(
      "DATABASE_URL",
      "Database URL",
      "Missing production database URL."
    );
  }

  return readyItem(
    "DATABASE_URL",
    "Database URL",
    "Production database URL is configured."
  );
}

function checkModelProvider(env: ReleaseEnvironment): ReleaseReadinessItem {
  const configuredProvider = MODEL_PROVIDER_KEYS.find((key) => Boolean(readEnv(env, key)));
  if (!configuredProvider) {
    return blockingItem(
      "MODEL_PROVIDER",
      "Default model provider",
      "Configure at least one server-side model provider API key."
    );
  }

  return readyItem(
    "MODEL_PROVIDER",
    "Default model provider",
    `Server-side model provider is configured via ${configuredProvider}.`
  );
}

function checkOpenAlex(env: ReleaseEnvironment): ReleaseReadinessItem {
  if (!readEnv(env, "OPENALEX_API_KEY")) {
    return degradedItem(
      "OPENALEX_API_KEY",
      "OpenAlex search",
      "OpenAlex key is missing; scholarly search may be rate-limited or degraded."
    );
  }

  return readyItem(
    "OPENALEX_API_KEY",
    "OpenAlex search",
    "OpenAlex search key is configured."
  );
}

function checkTavilySearch(env: ReleaseEnvironment): ReleaseReadinessItem {
  const hasMcpUrl = Boolean(readEnv(env, "TAVILY_MCP_URL"));
  const hasApiKey = Boolean(readEnv(env, "TAVILY_API_KEY"));
  if (!hasMcpUrl && !hasApiKey) {
    return degradedItem(
      "TAVILY_SEARCH",
      "Tavily public web search",
      "Tavily search is missing; direction discovery will rely on scholarly metadata only."
    );
  }

  return readyItem(
    "TAVILY_SEARCH",
    "Tavily public web search",
    hasMcpUrl ? "Tavily MCP search is configured." : "Tavily REST search is configured."
  );
}

function getOverallStatus(
  items: ReleaseReadinessItem[]
): ReleaseReadinessReport["status"] {
  if (items.some((item) => item.status === "blocking")) return "blocking";
  if (items.some((item) => item.status === "degraded")) return "degraded";
  return "ready";
}

function readEnv(env: ReleaseEnvironment, key: string) {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : "";
}

function readyItem(
  key: string,
  label: string,
  message: string
): ReleaseReadinessItem {
  return { key, label, status: "ready", message };
}

function degradedItem(
  key: string,
  label: string,
  message: string
): ReleaseReadinessItem {
  return { key, label, status: "degraded", message };
}

function blockingItem(
  key: string,
  label: string,
  message: string
): ReleaseReadinessItem {
  return { key, label, status: "blocking", message };
}

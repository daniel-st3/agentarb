import rules from "./generated-policy.json";
import { readLimitedJson } from "./http-boundary";
import type {
  Category,
  Marketplace,
  Opportunity,
  SourceStatus,
} from "./contracts";

const PUBLIC_SOURCES = {
  opentask: {
    url: "https://opentask.ai/api/tasks?limit=5",
    claimConstraint: "bid",
    settlementConstraint: "offplatform",
  },
  execution_market: {
    url: "https://api.execution.market/api/v1/tasks/available?limit=5",
    claimConstraint: "open_claim",
    settlementConstraint: "onchain",
  },
} as const;

const CLASSIFICATION: Record<string, Category> =
  rules.execution_categories as Record<string, Category>;

export function classify(tags: string[], title: string): Category {
  const normalized = new Set(tags.map((tag) => tag.toLowerCase().trim()));
  for (const [category, keywords] of rules.category_tags) {
    if ((keywords as string[]).some((keyword) => normalized.has(keyword)))
      return category as Category;
  }
  for (const [category, keywords] of rules.category_tags) {
    if (
      (keywords as string[]).some((keyword) =>
        title.toLowerCase().includes(keyword),
      )
    )
      return category as Category;
  }
  return "unknown";
}

function parseAmount(text: string): number | null {
  const range = text.match(
    /\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:-|–|—|to)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(USDC|USD|USDT|EURC)?/i,
  );
  if (range) {
    const low = Number(range[1].replaceAll(",", ""));
    const high = Number(range[2].replaceAll(",", ""));
    if (high >= low) return low;
  }
  const matches = [
    ...text.matchAll(
      /\$\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:USDC|USD|USDT|EURC)/gi,
    ),
  ];
  const values = matches
    .map((match) => Number((match[1] ?? match[2]).replaceAll(",", "")))
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

export function normalizeOpenTask(
  raw: Record<string, unknown>,
  observedAt: string,
): Opportunity {
  const tags = Array.isArray(raw.skillsTags)
    ? raw.skillsTags.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const title =
    typeof raw.title === "string" ? raw.title : "Untitled public task";
  const amount = typeof raw.budgetAmount === "number" ? raw.budgetAmount : null;
  const currency =
    typeof raw.budgetCurrency === "string"
      ? raw.budgetCurrency.toUpperCase()
      : "USD";
  const payout = ["USD", "USDC", "USDT", "EURC"].includes(currency)
    ? (amount ??
      parseAmount(typeof raw.budgetText === "string" ? raw.budgetText : ""))
    : null;
  return {
    opportunityId: `opentask:${String(raw.id ?? "")}`,
    marketplace: "opentask",
    sourceType: "live_public",
    observedAt,
    title,
    description: typeof raw.description === "string" ? raw.description : "",
    category: classify(tags, title),
    tags,
    payoutUsd: payout,
    requiredCapabilities: [],
    requiredReputation: 0,
    claimConstraint: "bid",
    settlementConstraint: "offplatform",
  };
}

export function normalizeExecutionMarket(
  raw: Record<string, unknown>,
  observedAt: string,
): Opportunity {
  const nativeCategory = typeof raw.category === "string" ? raw.category : "";
  const capabilities = Array.isArray(raw.required_capabilities)
    ? raw.required_capabilities.filter(
        (value): value is string => typeof value === "string",
      )
    : typeof raw.required_capabilities === "string"
      ? [raw.required_capabilities]
      : [];
  return {
    opportunityId: `execution_market:${String(raw.id ?? "")}`,
    marketplace: "execution_market",
    sourceType: "live_public",
    observedAt,
    title: typeof raw.title === "string" ? raw.title : "Untitled public task",
    description: typeof raw.instructions === "string" ? raw.instructions : "",
    category: CLASSIFICATION[nativeCategory] ?? "unknown",
    tags: [nativeCategory, ...capabilities],
    payoutUsd: typeof raw.bounty_usd === "number" ? raw.bounty_usd : null,
    requiredCapabilities: capabilities,
    requiredReputation: Number(raw.min_reputation ?? 0),
    claimConstraint: "open_claim",
    settlementConstraint: "onchain",
  };
}

async function publicGet(
  marketplace: keyof typeof PUBLIC_SOURCES,
): Promise<Opportunity[]> {
  const source = PUBLIC_SOURCES[marketplace];
  const response = await fetch(source.url, {
    method: "GET",
    redirect: "error",
    cache: "no-store",
    credentials: "omit",
    headers: {
      Accept: "application/json",
      "User-Agent": "agent-arbiter-public-demo/1",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`public_discovery_http_${response.status}`);
  const payload = await readLimitedJson(response, 262_144);
  if (!payload || typeof payload !== "object")
    throw new Error("invalid_public_payload");
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.tasks)) throw new Error("invalid_public_tasks");
  const tasks = record.tasks;
  if (
    tasks.some(
      (task) =>
        !task ||
        typeof task !== "object" ||
        Array.isArray(task) ||
        !validTask(task),
    )
  ) {
    throw new Error("malformed_public_record");
  }
  const observedAt = new Date().toISOString();
  return tasks
    .filter(
      (task): task is Record<string, unknown> =>
        Boolean(task) && typeof task === "object" && !Array.isArray(task),
    )
    .slice(0, 5)
    .map((task) =>
      marketplace === "opentask"
        ? normalizeOpenTask(task, observedAt)
        : normalizeExecutionMarket(task, observedAt),
    );
}

function validTask(task: Record<string, unknown>): boolean {
  if (!task.id || !["string", "number"].includes(typeof task.id)) return false;
  for (const field of ["title", "description", "instructions", "budgetText"]) {
    const value = task[field];
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "string" || value.length > 8000)
    )
      return false;
  }
  for (const field of ["budgetAmount", "bounty_usd"]) {
    const value = task[field];
    // Python treats non-numeric payout fields as unpriced (OpenTask can then
    // fall back to budgetText). A bounded string is valid source data, not USD.
    if (typeof value === "string" && value.length <= 256) continue;
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1e9)
    )
      return false;
  }
  const reputation = task.min_reputation;
  if (
    reputation != null &&
    (!["number", "string"].includes(typeof reputation) ||
      !/^\d{1,9}$/.test(String(reputation)))
  )
    return false;
  for (const field of ["skillsTags", "required_capabilities"]) {
    const value = task[field];
    if (value == null) continue;
    if (typeof value === "string" && value.length <= 128) continue;
    if (
      !Array.isArray(value) ||
      value.length > 100 ||
      value.some((item) => typeof item !== "string" || item.length > 128)
    )
      return false;
  }
  return true;
}

export const CONTROLLED_OPPORTUNITIES: Opportunity[] =
  rules.controlled_records.map((record) => ({
    opportunityId: `mock:${record.bounty_id}`,
    marketplace: "mock" as Marketplace,
    sourceType: "controlled_demonstration",
    observedAt: null,
    title: record.title,
    description: record.description,
    tags: record.tags,
    category: record.category as Category,
    payoutUsd: record.payout_usd,
    requiredCapabilities: [],
    requiredReputation: 0,
    claimConstraint: "open_claim",
    settlementConstraint: "simulated",
  }));

export async function discoverPublic(): Promise<{
  opportunities: Opportunity[];
  statuses: SourceStatus[];
}> {
  const markets = Object.keys(PUBLIC_SOURCES) as Array<
    keyof typeof PUBLIC_SOURCES
  >;
  const settled = await Promise.allSettled(
    markets.map((market) => publicGet(market)),
  );
  const opportunities: Opportunity[] = [];
  const statuses: SourceStatus[] = [];
  settled.forEach((result, index) => {
    const marketplace = markets[index];
    const observedAt = new Date().toISOString();
    if (result.status === "fulfilled") {
      opportunities.push(...result.value);
      statuses.push({
        marketplace,
        status: result.value.length ? "available" : "empty",
        count: result.value.length,
        observedAt,
      });
    } else {
      statuses.push({
        marketplace,
        status: "unavailable",
        count: 0,
        observedAt,
      });
    }
  });
  return {
    opportunities: [...opportunities, ...CONTROLLED_OPPORTUNITIES],
    statuses,
  };
}

export const PUBLIC_DISCOVERY_METHOD = "GET" as const;
export const PUBLIC_SOURCE_URLS = Object.freeze(
  Object.fromEntries(
    Object.entries(PUBLIC_SOURCES).map(([key, source]) => [key, source.url]),
  ),
);

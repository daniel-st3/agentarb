import { it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({
  mode: "shared",
  get: vi.fn(),
  set: vi.fn(),
  lease: vi.fn(),
}));
vi.mock("../src/server/intelligence/cache", () => ({
  snapshotCache: () => store,
}));
import { cachedNetworkView } from "../src/server/intelligence/cached-view";
import {
  parseMcpRegistry,
  mcpDefinition,
} from "../src/server/intelligence/connectors/mcp-registry";
import { mcpFixture } from "./intelligence-fixtures";
beforeEach(() => {
  vi.stubEnv("DISCOVERY_MODE", "live");
  store.get.mockReset();
  store.set.mockReset();
  store.lease.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("server first paint reads existing snapshots, never refreshes or writes", async () => {
  const now = new Date().toISOString(),
    records = parseMcpRegistry(mcpFixture, now),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  store.get.mockImplementation(async (id: string) =>
    id === "mcp"
      ? {
          snapshot: {
            connectorId: "mcp",
            observedAt: now,
            records,
            health: {
              connectorId: "mcp",
              name: mcpDefinition.name,
              kind: mcpDefinition.kind,
              accessMode: mcpDefinition.accessMode,
              status: "healthy",
              enabled: true,
              freshness: "live",
              lastAttemptAt: now,
              lastSuccessAt: now,
              cachedRecordCount: records.length,
            },
          },
          nextAttempt: Date.now() + 3600000,
          lastAttempt: now,
          error: false,
          failures: 0,
        }
      : null,
  );
  const result = await cachedNetworkView();
  expect(result).not.toBeNull();
  expect(result!.records[0]).toMatchObject({
    freshness: "cached_live",
    observedAt: now,
  });
  expect(result!.cacheMode).toBe("shared");
  expect(fetcher).not.toHaveBeenCalled();
  expect(store.set).not.toHaveBeenCalled();
  expect(store.lease).not.toHaveBeenCalled();
});
it("durable read failure does not announce a fake memory fallback", async () => {
  store.get.mockRejectedValue(new Error("fixture unavailable"));
  expect(await cachedNetworkView()).toBeNull();
  expect(store.set).not.toHaveBeenCalled();
});
it("offline first paint contains only labeled controlled records", async () => {
  vi.stubEnv("DISCOVERY_MODE", "offline");
  const result = await cachedNetworkView();
  expect(result!.records.every((r) => r.freshness === "simulated_demo")).toBe(
    true,
  );
  expect(store.get).not.toHaveBeenCalled();
});
it("expired snapshots do not reappear as fresh cached supply", async () => {
  store.get.mockResolvedValue({
    snapshot: { observedAt: "2020-01-01T00:00:00Z" },
    lastAttempt: "2020-01-01T00:00:00Z",
  });
  const result = await cachedNetworkView();
  expect(result!.records.every((r) => r.freshness === "simulated_demo")).toBe(
    true,
  );
  expect(result!.sources.every((s) => s.status === "unavailable")).toBe(true);
});

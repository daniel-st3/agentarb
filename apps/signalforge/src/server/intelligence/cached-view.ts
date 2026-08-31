import "server-only";
import { cache } from "react";
import {
  NetworkResponseSchema,
  type NetworkResponse,
} from "@/domain/intelligence";
import { snapshotCache } from "./cache";
import { definitions, demoListings } from "./service";
import { demoDataEnabled } from "../demo-mode";
/** Server first paint reads existing snapshots only. No unmetered connector refresh. */
export const cachedNetworkView = cache(
  async (): Promise<NetworkResponse | null> => {
    try {
      if (process.env.DISCOVERY_MODE === "offline")
        return {
          version: "1.0",
          records: demoDataEnabled() ? demoListings() : [],
          sources: [],
          cacheMode: "non_durable_demo",
          warnings: ["Offline controlled demonstration."],
          executionStatus: "execution_not_enabled",
        };
      const store = snapshotCache(),
        now = Date.now();
      const entries = await Promise.all(
        definitions.map((d) => store.get(d.id)),
      );
      const valid = entries.filter(
        (e) =>
          e?.snapshot && now - Date.parse(e.snapshot.observedAt) <= 86400000,
      );
      return NetworkResponseSchema.parse({
        version: "1.0",
        records: [
          ...valid.flatMap((e) =>
            e!.snapshot!.records.map((l) => ({
              ...l,
              freshness: "cached_live",
              dataQuality: {
                ...l.dataQuality,
                freshnessScore: Math.max(
                  0,
                  1 - (now - Date.parse(l.observedAt)) / 86400000,
                ),
              },
            })),
          ),
          ...(demoDataEnabled() ? demoListings() : []),
        ],
        sources: definitions.map((d, i) => {
          const entry = entries[i],
            snapshot = entry?.snapshot;
          return snapshot && now - Date.parse(snapshot.observedAt) <= 86400000
            ? {
                ...snapshot.health,
                freshness: "cached_live",
                status: entry?.error ? "degraded" : "healthy",
                nextRefreshAfter: new Date(entry!.nextAttempt).toISOString(),
              }
            : {
                connectorId: d.id,
                name: d.name,
                kind: d.kind,
                status: "unavailable",
                accessMode: d.accessMode,
                enabled: true,
                freshness: "unavailable",
                lastAttemptAt: entry?.lastAttempt ?? null,
                cachedRecordCount: 0,
              };
        }),
        cacheMode: store.mode,
        warnings: [
          "Cached public observations only. Refresh uses the protected public API.",
        ],
        executionStatus: "execution_not_enabled",
      });
    } catch (error) {
      console.warn("snapshot_unavailable", {
        category:
          error instanceof Error && error.message === "store_unavailable"
            ? "configuration"
            : "cache_unavailable",
      });
      // Do not relabel a failed durable store as a working memory fallback.
      return null;
    }
  },
);

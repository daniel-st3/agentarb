"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { DemoRepository } from "@/domain/repository";
import { RunSchema, type Run } from "@/domain/schema";
import {
  seedRoutes,
  ExecutionRouteContractSchema,
  type ExecutionRouteContract,
} from "@/domain/route-planner";
const SessionContext = createContext<{
  runs: Run[];
  save: (run: Run) => Promise<void>;
  routes: ExecutionRouteContract[];
  saveRoute: (route: ExecutionRouteContract) => void;
} | null>(null);
export function ResearchSession({
  seeds,
  children,
}: {
  seeds: Run[];
  children: ReactNode;
}) {
  const [repository] = useState(() => new DemoRepository(seeds));
  const [runs, setRuns] = useState(seeds);
  const [routes, setRoutes] = useState(seedRoutes);
  function saveRoute(value: ExecutionRouteContract) {
    const route = ExecutionRouteContractSchema.parse(value);
    setRoutes((current) =>
      [route, ...current.filter((r) => r.routeId !== route.routeId)].slice(
        0,
        30,
      ),
    );
  }
  async function save(run: Run) {
    await repository.save(RunSchema.parse(run));
    setRuns(await repository.list());
  }
  return (
    <SessionContext.Provider value={{ runs, save, routes, saveRoute }}>
      {children}
    </SessionContext.Provider>
  );
}
export function useResearchSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Research session is unavailable.");
  return session;
}

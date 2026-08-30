"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { DemoRepository } from "@/domain/repository";
import { RunSchema, type Run } from "@/domain/schema";
const SessionContext = createContext<{
  runs: Run[];
  save: (run: Run) => Promise<void>;
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
  async function save(run: Run) {
    await repository.save(RunSchema.parse(run));
    setRuns(await repository.list());
  }
  return (
    <SessionContext.Provider value={{ runs, save }}>
      {children}
    </SessionContext.Provider>
  );
}
export function useResearchSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Research session is unavailable.");
  return session;
}

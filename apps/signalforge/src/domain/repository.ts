import { RunSchema, type Run } from "./schema";
export interface ResearchRepository {
  list(): Promise<Run[]>;
  get(id: string): Promise<Run | undefined>;
  save(run: Run): Promise<void>;
}
/** Instance-scoped, never a global server store. Recreated for each browser tab. */
export class DemoRepository implements ResearchRepository {
  private runs = new Map<string, Run>();
  constructor(seeds: Run[] = []) {
    seeds.forEach((run) => this.runs.set(run.request.id, RunSchema.parse(run)));
  }
  async list() {
    return [...this.runs.values()].map((run) => structuredClone(run));
  }
  async get(id: string) {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : undefined;
  }
  async save(run: Run) {
    const parsed = RunSchema.parse(run);
    const existing = this.runs.get(parsed.request.id);
    if (existing?.request.status === "complete")
      throw new Error("Completed runs are immutable.");
    if (this.runs.size >= 30 && !existing)
      throw new Error("Session archive is full. Start a new session.");
    this.runs.set(parsed.request.id, structuredClone(parsed));
  }
}
/** Fail closed: selecting durable storage requires a separately implemented adapter. */
export class HostedRepository implements ResearchRepository {
  async list(): Promise<Run[]> {
    throw new Error("Hosted persistence is not configured.");
  }
  async get(): Promise<Run | undefined> {
    throw new Error("Hosted persistence is not configured.");
  }
  async save(): Promise<void> {
    throw new Error("Hosted persistence is not configured.");
  }
}

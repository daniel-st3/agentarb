// Local analysis only. Never imported by src/ or deployed route handlers.
import { DatabaseSync } from "node:sqlite";
import { RunSchema, type Run } from "../src/domain/schema";
import type { ResearchRepository } from "../src/domain/repository";
export class LocalRepository implements ResearchRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    if (process.env.VERCEL)
      throw new Error("Local storage is unavailable on Vercel.");
    this.db = new DatabaseSync(path);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS research_runs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
    );
  }
  async list(): Promise<Run[]> {
    return this.db
      .prepare("SELECT payload FROM research_runs ORDER BY id")
      .all()
      .map((row) => RunSchema.parse(JSON.parse(String(row.payload))));
  }
  async get(id: string) {
    const row = this.db
      .prepare("SELECT payload FROM research_runs WHERE id = ?")
      .get(id);
    return row ? RunSchema.parse(JSON.parse(String(row.payload))) : undefined;
  }
  async save(run: Run) {
    const parsed = RunSchema.parse(run);
    // Append-only local audit; callers use a distinct record ID for a new snapshot.
    this.db
      .prepare("INSERT INTO research_runs(id,payload) VALUES (?,?)")
      .run(parsed.request.id, JSON.stringify(parsed));
  }
  close() {
    this.db.close();
  }
}

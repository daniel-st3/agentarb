export type SaveState = "idle" | "saving" | "saved" | "failed";

type PersistenceResponse = {
  status?: unknown;
  savedRunId?: unknown;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isConfirmedSavedRun(value: unknown): value is {
  status: "saved";
  savedRunId: string;
} {
  if (!value || typeof value !== "object") return false;
  const persistence = value as PersistenceResponse;
  return persistence.status === "saved" &&
    typeof persistence.savedRunId === "string" &&
    uuidPattern.test(persistence.savedRunId);
}

export function saveStateFromPersistence(value: unknown): SaveState {
  if (isConfirmedSavedRun(value)) return "saved";
  if (value && typeof value === "object" && (value as PersistenceResponse).status === "failed") {
    return "failed";
  }
  return "idle";
}

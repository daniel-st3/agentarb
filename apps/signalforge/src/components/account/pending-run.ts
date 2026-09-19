"use client";

import { z } from "zod";
import { ForgeUnderwritingInputSchema, ForgeUnderwritingResponseSchema } from "@/domain/forge-underwriting";

const key = "signalforge:pending-forge-save:v1";
const PendingRunSchema = z.object({
  input: ForgeUnderwritingInputSchema,
  result: ForgeUnderwritingResponseSchema,
  returnTo: z.string().startsWith("/").max(300),
  createdAt: z.string().datetime(),
}).strict();
export type PendingForgeRun = z.infer<typeof PendingRunSchema>;

export function setPendingForgeRun(value: PendingForgeRun) {
  sessionStorage.setItem(key, JSON.stringify(PendingRunSchema.parse(value)));
}
export function getPendingForgeRun() {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const value = PendingRunSchema.parse(JSON.parse(raw));
    if (Date.now() - Date.parse(value.createdAt) > 60 * 60 * 1000) {
      sessionStorage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}
export function clearPendingForgeRun() {
  sessionStorage.removeItem(key);
}


import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const localSecret = randomBytes(32);
const secret = () => {
  const configured = process.env.RATE_LIMIT_SALT;
  return configured && configured.length >= 32 ? configured : localSecret;
};
const payload = (clientRunId: string, receiptHash: string) =>
  `signalforge:saved-run:v1:${clientRunId}:${receiptHash}`;

export function issueSaveAuthorization(clientRunId: string, receiptHash: string) {
  return createHmac("sha256", secret()).update(payload(clientRunId, receiptHash)).digest("hex");
}

export function verifySaveAuthorization(clientRunId: string, receiptHash: string, proof: string) {
  if (!/^[a-f0-9]{64}$/.test(proof)) return false;
  const expected = Buffer.from(issueSaveAuthorization(clientRunId, receiptHash), "hex");
  return timingSafeEqual(expected, Buffer.from(proof, "hex"));
}


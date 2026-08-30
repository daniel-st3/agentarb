/** No network methods: access/redistribution gate has not passed. */
export const candidateSources = [
  {
    id: "openrouter",
    name: "OpenRouter models",
    accessMode: "unsupported",
    reason:
      "Public model API documentation exists, but current service terms restrict copying and competing-service use. Redistribution permission not established; disabled.",
  },
  {
    id: "bazaar",
    name: "Coinbase Bazaar",
    accessMode: "unsupported",
    reason:
      "Public GET is documented, but current CDP terms §9 restrict third-party data sharing without written authorization.",
  },
  {
    id: "opentask",
    name: "OpenTask",
    accessMode: "unsupported",
    reason:
      "Current public redistribution terms not verified for this increment. Legacy Python connector is not enabled here.",
  },
  {
    id: "execution-market",
    name: "execution.market",
    accessMode: "unsupported",
    reason:
      "Public read-only technical support is not sufficient evidence of listing redistribution permission; disabled pending terms review.",
  },
  {
    id: "a2a-peers",
    name: "External A2A agents",
    accessMode: "unsupported",
    reason:
      "No individual public Agent Card and redistribution permission has been verified. No arbitrary card URLs accepted.",
  },
] as const;

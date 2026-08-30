import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/developers",
        "/network",
        "/.well-known/agent-card.json",
        "/llms.txt",
      ],
      disallow: ["/api/", "/forge/route_"],
    },
  };
}

/** Authored schema fixtures. These are never served as live observations. */
export const mcpFixture = {
  servers: [
    {
      server: {
        name: "org.example/research",
        title: "Research Fixture",
        description: "Web search over a public index",
        version: "1.0",
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          updatedAt: "2026-08-01T00:00:00Z",
          isLatest: true,
        },
      },
    },
  ],
};
export const guruFixture = {
  apis: {
    "nytimes.com:archive": {
      info: {
        title: "Archive API",
        description: "Article metadata from an archive",
        version: "1.0",
      },
      updated: "2021-06-21T00:00:00Z",
    },
  },
};

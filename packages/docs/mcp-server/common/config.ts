export const MCP_CONFIG = {
  server: {
    name: "ignis-docs",
    version: "0.0.1",
  },
  search: {
    snippetLength: 300,
    defaultLimit: 10,
    maxLimit: 50,
    minQueryLength: 2,
  },
  fuse: {
    includeScore: true,
    threshold: 0.4,
    minMatchCharLength: 2,
    findAllMatches: true,
    ignoreLocation: true,
    keys: [
      { name: "title", weight: 0.7 },
      { name: "content", weight: 0.3 },
    ],
  },
} as const;

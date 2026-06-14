export class MCPConfigs {
  static readonly server = { name: 'ignis-docs', version: '0.0.1' } as const;

  private static _branch: string = 'main';

  static readonly github = {
    apiBase: 'https://api.github.com',
    rawContentBase: 'https://raw.githubusercontent.com',
    repoOwner: 'VENIZIA-AI',
    repoPath: 'repos',
    repoName: 'ignis',
    userAgent: 'Ignis-MCP-Server',

    get branch(): string {
      return MCPConfigs._branch;
    },
  };

  static setBranch(opts: { branch: string }) {
    MCPConfigs._branch = opts.branch;
  }

  static readonly search = {
    snippetLength: 320,
    defaultLimit: 10,
    maxLimit: 50,
    minQueryLength: 2,
  };

  static readonly codeSearch = {
    defaultLimit: 10,
    maxLimit: 30,
    minQueryLength: 2,
    rateLimitWarningThreshold: 5,
  };

  static readonly fuse = {
    includeScore: true,
    // 0.0 = exact match, 1.0 = match anything
    threshold: 0.4,
    minMatchCharLength: 2,
    findAllMatches: true,
    ignoreLocation: true,
    keys: [
      { name: 'title', weight: 0.7 },
      { name: 'content', weight: 0.3 },
    ],
  };
}

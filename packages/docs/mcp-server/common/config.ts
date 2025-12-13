/**
 * Centralized configuration for the Ignis MCP Documentation Server.
 * All tool constants and settings are defined here for easy maintenance.
 */
export class MCPConfigs {
  // ----------------------------------------------------------------------------
  // SERVER CONFIGURATION
  // ----------------------------------------------------------------------------
  static readonly server = { name: 'ignis-docs', version: '0.0.1' } as const;

  // ----------------------------------------------------------------------------
  // GITHUB CONFIGURATION
  // ----------------------------------------------------------------------------

  /** Runtime-configurable branch (set via CLI argument) */
  private static _branch: string = 'main';

  static readonly github = {
    apiBase: 'https://api.github.com',
    rawContentBase: 'https://raw.githubusercontent.com',
    repoOwner: 'VENIZIA-AI',
    repoPath: 'repos',
    repoName: 'ignis',
    userAgent: 'Ignis-MCP-Server',

    /** Get current branch (configurable at runtime) */
    get branch(): string {
      return MCPConfigs._branch;
    },
  };

  /**
   * Set the GitHub branch to use for fetching source code.
   * Call this before starting the server.
   * @param branch - Branch name (e.g., 'main', 'develop', 'feature/xyz')
   */
  static setBranch(opts: { branch: string }) {
    MCPConfigs._branch = opts.branch;
  }

  // ----------------------------------------------------------------------------
  // DOCUMENTATION SEARCH CONFIGURATION
  // ----------------------------------------------------------------------------
  static readonly search = {
    /** Maximum characters for content snippet in search results */
    snippetLength: 320,
    /** Default number of results to return */
    defaultLimit: 10,
    /** Maximum allowed results per search */
    maxLimit: 50,
    /** Minimum query length required */
    minQueryLength: 2,
  };

  // ----------------------------------------------------------------------------
  // CODE SEARCH CONFIGURATION
  // ----------------------------------------------------------------------------
  static readonly codeSearch = {
    /** Default number of results to return */
    defaultLimit: 10,
    /** Maximum allowed results per search (GitHub API limit) */
    maxLimit: 30,
    /** Minimum query length required */
    minQueryLength: 2,
    /** Rate limit warning threshold */
    rateLimitWarningThreshold: 5,
  };

  // ----------------------------------------------------------------------------
  // FUSE.JS SEARCH ENGINE CONFIGURATION
  // ----------------------------------------------------------------------------
  static readonly fuse = {
    includeScore: true,
    /** Lower threshold = stricter matching (0.0 = exact, 1.0 = match anything) */
    threshold: 0.4,
    minMatchCharLength: 2,
    findAllMatches: true,
    ignoreLocation: true,
    /** Search field weights: title matches are prioritized over content */
    keys: [
      { name: 'title', weight: 0.7 },
      { name: 'content', weight: 0.3 },
    ],
  };
}

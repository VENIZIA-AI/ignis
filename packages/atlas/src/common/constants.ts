/** MCP protocol versions this server negotiates `initialize` against, newest first. */
export class ProtocolVersions {
  static readonly NEWEST = '2025-06-18';
  static readonly V2025_03_26 = '2025-03-26';
  static readonly V2024_11_05 = '2024-11-05';
  static readonly SCHEME_SET = new Set<string>([this.NEWEST, this.V2025_03_26, this.V2024_11_05]);
  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export class AtlasConstants {
  static readonly SERVER_NAME = 'ignis-atlas';
  static readonly PROTOCOL_VERSION = ProtocolVersions.NEWEST;
  static readonly SEARCH_BUDGET_CHARS = 2000;
  static readonly GET_BUDGET_CHARS = 8000;
  static readonly SNIPPET_MAX_CHARS = 300;
  static readonly SEARCH_DEFAULT_LIMIT = 10;
}

export class AtlasModes {
  static readonly REPOSITORY = 'repo';
  static readonly SNAPSHOT = 'snapshot';
  static readonly SCHEME_SET = new Set<string>([this.REPOSITORY, this.SNAPSHOT]);
  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export class Corpora {
  static readonly WIKI = 'wiki';
  static readonly CHANGELOG = 'changelog';
  static readonly KNOWLEDGE = 'knowledge';
  static readonly SCHEME_SET = new Set<string>([this.WIKI, this.CHANGELOG, this.KNOWLEDGE]);
  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

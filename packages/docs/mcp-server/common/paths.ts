import path from 'node:path';

const MCP_ROOT = __dirname;
// When compiled, __dirname is mcp-server/dist/common
// Go up 3 levels to reach package root: common -> dist -> mcp-server -> docs
const DOCS_ROOT = path.resolve(MCP_ROOT, '..', '..', '..');

export class Paths {
  static readonly WIKI = path.join(DOCS_ROOT, 'wiki');

  static readonly GUIDES = path.join(this.WIKI, 'guides');
  static readonly GET_STARTED = path.join(this.GUIDES, 'get-started');
  static readonly CORE_CONCEPTS = path.join(this.GUIDES, 'core-concepts');
  static readonly BEST_PRACTICES = path.join(this.WIKI, 'best-practices');

  static readonly REFERENCES = path.join(this.WIKI, 'references');
  static readonly BASE = path.join(this.REFERENCES, 'base');
  static readonly UTILITIES = path.join(this.REFERENCES, 'utilities');

  static readonly EXTENSIONS = path.join(this.WIKI, 'extensions');
  static readonly COMPONENTS = path.join(this.EXTENSIONS, 'components');
  static readonly HELPERS = path.join(this.EXTENSIONS, 'helpers');
  static readonly SOURCE_DETAILS = path.join(this.EXTENSIONS, 'src-details');
}

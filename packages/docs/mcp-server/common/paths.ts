import path from "node:path";

const MCP_ROOT = __dirname;
const DOCS_ROOT = path.resolve(MCP_ROOT, "..", "..");

export class Paths {
  static readonly WIKI = path.join(DOCS_ROOT, "wiki");

  static readonly GET_STARTED = path.join(this.WIKI, "get-started");
  static readonly BEST_PRACTICES = path.join(this.GET_STARTED, "best-practices");
  static readonly CORE_CONCEPTS = path.join(this.GET_STARTED, "core-concepts");

  static readonly REFERENCES = path.join(this.WIKI, "references");
  static readonly BASE = path.join(this.REFERENCES, "base");
  static readonly COMPONENTS = path.join(this.REFERENCES, "components");
  static readonly HELPERS = path.join(this.REFERENCES, "helpers");
  static readonly SOURCE_DETAILS = path.join(this.REFERENCES, "src-details");
  static readonly UTILITIES = path.join(this.REFERENCES, "utilities");
}

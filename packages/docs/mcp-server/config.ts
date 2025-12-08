import path from 'node:path';

const MCP_ROOT = __dirname;
const DOCS_ROOT = path.resolve(MCP_ROOT, '..');

export const PATHS = {
  wiki: path.join(DOCS_ROOT, 'wiki'),
  deepDive: path.join(DOCS_ROOT, 'wiki/references/src-details'),
};

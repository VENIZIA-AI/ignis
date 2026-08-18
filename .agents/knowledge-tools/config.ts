/**
 * config.ts - the ONLY repo-specific configuration for the OKF knowledge tooling.
 *
 * Everything that knows the shape of THIS repository lives here: paths, denylists,
 * section order/labels, and the coverage axes. Porting the bundle to another repo
 * means editing this file; okf.ts / lib.ts / mcp.ts / viz.ts stay untouched.
 *
 * Renderers themselves are code, not config - they live in the RENDERERS registry
 * at the top of okf.ts and read their paths from here.
 */
import { resolve } from 'node:path';

export const REPO = resolve(import.meta.dir, '../..');
export const BUNDLE = resolve(REPO, '.agents/knowledge');

/** Directories never walked when scanning source. */
export const PRUNE_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.turbo',
  'coverage',
  '.cache',
  '.vitepress',
  '.claude',
]);

export const PATHS = {
  packages: resolve(REPO, 'packages'),
  examples: resolve(REPO, 'examples'),
  docs: resolve(REPO, 'docs/wiki'),
  coreComponents: resolve(REPO, 'packages/core-server/src/components'),
  coreBindings: resolve(REPO, 'packages/core-server/src/common/bindings.ts'),
  bootBooters: resolve(REPO, 'packages/boot/src/booters'),
  helpersModules: resolve(REPO, 'packages/helpers/src/modules'),
  helpersUtilities: resolve(REPO, 'packages/helpers/src/utilities'),
  makefile: resolve(REPO, 'Makefile'),
} as const;

/**
 * Scaffold or non-concept directories. Empty today - every packages/* and examples/*
 * dir is a real artifact that earns a concept. Add names here rather than special-casing
 * them in the renderers.
 */
export const PACKAGE_DENYLIST = new Set<string>([]);
export const EXAMPLE_DENYLIST = new Set<string>([]);

/** Bundle sections, in display order (viz + index). Unknown sections sort in after these. */
export const SECTION_ORDER = [
  'overview',
  'architecture',
  'packages',
  'conventions',
  'process',
  'examples',
  'reference',
] as const;

export const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  architecture: 'Architecture',
  packages: 'Packages',
  conventions: 'Conventions',
  process: 'Process',
  examples: 'Examples',
  reference: 'Reference',
};

/** Name advertised over the MCP stdio transport. */
export const MCP_SERVER_NAME = 'ignis-knowledge';
export const MCP_SERVER_VERSION = '0.1.0';

/** Reserved OKF filenames that carry no `type:` frontmatter and are never counted as concepts. */
export const RESERVED_FILES = new Set(['index.md', 'log.md']);

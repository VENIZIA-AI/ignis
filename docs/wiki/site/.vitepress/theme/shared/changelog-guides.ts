/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The migration blocks of a version folder (`changelogs/<X.Y.Z>/migration.yaml`) as the upgrade guide shows them. A block is
 * what an app does for one Breaking or Deprecated item: the symbols it is affected through, the code before and after, the
 * ordered steps, a note on data, the way back, and the name of a codemod. The YAML is read here, at build time (the page never
 * loads a parser), and a file that cannot be read gives no blocks: `vulcan changelog check` is what reports it. This file is
 * pure Node (no VitePress import) so a test can run it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse } from 'yaml';
import { escapeHtml, renderParagraphs } from './changelog-items';

export type TGuideDirection = {
  steps: string[];
  /** The code before, as HTML. */
  beforeHtml?: string;
  afterHtml?: string;
};

export type TGuideBlock = {
  id: string;
  symbols: string[];
  /** The ordered steps of the upgrade; empty for a block that holds only code (an older folder). */
  steps: string[];
  beforeHtml?: string;
  afterHtml?: string;
  /** The note on stored data, as HTML. */
  dataHtml?: string;
  /** The name of the codemod that covers the block. */
  codemod?: string;
  downgrade: TGuideDirection;
};

/** The blocks of one version's `migration.yaml`, in the order an upgrade runs them. */
export type TVersionGuide = { version: string; blocks: TGuideBlock[] };

/**
 * What the index and the version page need of a guide, without its text: the ids of its blocks, the ids a codemod covers and
 * the names of the codemods.
 */
export type TGuideCount = { version: string; ids: string[]; covered: string[]; codemods: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/** Code as HTML: escaped, with a `//` comment line in a span the stylesheet colours. */
export const codeHtml = (opts: { code: string }): string =>
  opts.code
    .replace(/\s+$/, '')
    .split('\n')
    .map((line) =>
      /^\s*\/\//.test(line) ? `<span class="c">${escapeHtml(line)}</span>` : escapeHtml(line),
    )
    .join('\n');

const codeOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? codeHtml({ code: value }) : undefined;

const directionOf = (value: unknown): TGuideDirection => {
  const direction = isRecord(value) ? value : {};

  return {
    steps: strings(direction.steps),
    beforeHtml: codeOf(direction.before),
    afterHtml: codeOf(direction.after),
  };
};

/** The blocks of a `migration.yaml`, in file order; none for a text that is not a map of blocks. */
export const parseGuide = (opts: { text: string }): TGuideBlock[] => {
  let parsed: unknown;

  try {
    parsed = parse(opts.text);
  } catch {
    return [];
  }

  if (!isRecord(parsed)) {
    return [];
  }

  return Object.entries(parsed).flatMap(([id, raw]): TGuideBlock[] => {
    if (!isRecord(raw)) {
      return [];
    }

    const upgrade = directionOf(raw.upgrade);
    const data =
      typeof raw.data === 'string' && raw.data.trim() !== '' ? raw.data.trim() : undefined;

    return [
      {
        id,
        symbols: strings(raw.symbols),
        steps: upgrade.steps,
        beforeHtml: upgrade.beforeHtml,
        afterHtml: upgrade.afterHtml,
        dataHtml: data === undefined ? undefined : renderParagraphs({ text: data }),
        codemod: typeof raw.codemod === 'string' ? raw.codemod : undefined,
        downgrade: directionOf(raw.downgrade),
      },
    ];
  });
};

/** The order an upgrade runs: the blocks a codemod covers first, then the edits by hand, each group in file order. */
export const orderBlocks = (opts: { blocks: TGuideBlock[] }): TGuideBlock[] => [
  ...opts.blocks.filter((block) => block.codemod !== undefined),
  ...opts.blocks.filter((block) => block.codemod === undefined),
];

/**
 * The guides of the `migration.yaml` files in `files` (each in its version's folder): the versions that have at least one
 * block, newest first, with the blocks in the order an upgrade runs them.
 */
export const guidesFromFiles = (opts: { files: string[] }): TVersionGuide[] =>
  opts.files
    .flatMap((file): TVersionGuide[] => {
      const version = basename(dirname(file));
      const blocks = parseGuide({ text: readFileSync(file, 'utf8') });

      return /^\d+\.\d+\.\d+$/.test(version) && blocks.length > 0
        ? [{ version, blocks: orderBlocks({ blocks }) }]
        : [];
    })
    .sort((left, right) => {
      const [a, b] = [left.version.split('.').map(Number), right.version.split('.').map(Number)];

      return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
    });

/** The pages of the dynamic route `changelogs/upgrade/[version].md`: one per guide in `directory` (`changelogs/`), its blocks the params of the page. */
export const guidePaths = (opts: { directory: string }): { params: TVersionGuide }[] =>
  guidesFromFiles({
    files: !existsSync(opts.directory)
      ? []
      : readdirSync(opts.directory)
          .map((name) => join(opts.directory, name, 'migration.yaml'))
          .filter((file) => existsSync(file)),
  }).map((guide) => ({ params: guide }));

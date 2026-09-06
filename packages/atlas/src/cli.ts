#!/usr/bin/env bun
import { LoggerFactory } from '@venizia/ignis-helpers';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AtlasConstants, AtlasModes } from './common';
import type { TAtlasMode } from './common';
import { StderrLogger } from './common/logger';
import { buildServer } from './server';

// Must run before any code that could log: this is the only place a provider is ever registered.
LoggerFactory.use({ provider: StderrLogger });

const USAGE = `usage: ${AtlasConstants.SERVER_NAME} [mcp] [--root <dir>]`;
const REPO_WIKI_MARKER = 'docs/wiki/content';
const REPO_KNOWLEDGE_MARKER = '.agents/knowledge';
const SNAPSHOT_DIRECTORY = 'dist/corpus';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const usageError = (message: string): never => {
  console.error(`${AtlasConstants.SERVER_NAME}: ${message}\n${USAGE}`);
  process.exit(2);
};

const readSubcommand = (opts: { argv: string[] }): string => {
  const [first] = opts.argv;
  return first === undefined || first.startsWith('--') ? 'mcp' : first;
};

const readRoot = (opts: { argv: string[] }): string => {
  const index = opts.argv.indexOf('--root');
  return index === -1 ? process.cwd() : (opts.argv[index + 1] ?? process.cwd());
};

const isRepoCheckout = (opts: { root: string }): boolean =>
  existsSync(join(opts.root, REPO_WIKI_MARKER)) &&
  existsSync(join(opts.root, REPO_KNOWLEDGE_MARKER));

// The built CLI lives in `dist/cjs/`, two levels under the package root.
const packageDirectory = join(__dirname, '..', '..');

/** Repo mode wins when `root` is a checkout; otherwise the packaged snapshot next to this CLI; otherwise a usage error. */
const resolveServerOptions = (opts: { root: string }): { mode: TAtlasMode; root: string } => {
  const { root } = opts;

  if (isRepoCheckout({ root })) {
    return { mode: AtlasModes.REPO, root };
  }

  if (existsSync(join(packageDirectory, SNAPSHOT_DIRECTORY))) {
    return { mode: AtlasModes.SNAPSHOT, root: join(packageDirectory, 'dist') };
  }

  return usageError(
    `no IGNIS checkout at ${root} and no packaged snapshot - pass --root <dir> pointing at a checkout`,
  );
};

const argv = process.argv.slice(2);
const subcommand = readSubcommand({ argv });
if (subcommand !== 'mcp') {
  usageError(`unknown subcommand: ${subcommand}`);
}

const { mode, root } = resolveServerOptions({ root: readRoot({ argv }) });

try {
  buildServer({ mode, root })
    .run()
    .catch((error: unknown) => {
      console.error(`${AtlasConstants.SERVER_NAME}: ${messageOf(error)}`);
      process.exit(1);
    });
} catch (error) {
  console.error(`${AtlasConstants.SERVER_NAME}: ${messageOf(error)}`);
  process.exit(1);
}

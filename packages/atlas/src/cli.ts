#!/usr/bin/env bun
import { LoggerFactory } from '@venizia/ignis-helpers';
import { AtlasConstants } from './common';
import type { TAtlasMode } from './common';
import { findPackageDirectory, ModeUsageError, resolveMode } from './cli/modes';
import { StderrLogger } from './common/logger';
import { buildServer } from './server';

// Must run before any code that could log: this is the only place a provider is ever registered.
LoggerFactory.use({ provider: StderrLogger });

const USAGE = `usage: ${AtlasConstants.SERVER_NAME} [mcp] [--root <dir>]`;

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

/** Resolves `{ mode, root }` from `argv`, or prints usage and exits 2 - never throws. */
const resolveServerOptions = (opts: { argv: string[] }): { mode: TAtlasMode; root: string } => {
  try {
    const packageDirectory = findPackageDirectory({ startDirectory: __dirname });
    return resolveMode({ root: readRoot({ argv: opts.argv }), packageDirectory });
  } catch (error) {
    if (error instanceof ModeUsageError) {
      return usageError(error.message);
    }
    throw error;
  }
};

const argv = process.argv.slice(2);
const subcommand = readSubcommand({ argv });
if (subcommand !== 'mcp') {
  usageError(`unknown subcommand: ${subcommand}`);
}

const { mode, root } = resolveServerOptions({ argv });

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

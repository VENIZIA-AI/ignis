import { AtlasConstants, AtlasModes, Corpora } from '@/common';
import type { TAtlasMode } from '@/common';
import { isRepositoryCheckout, SNAPSHOT_DIRECTORY, workspaceFamilyOf } from '@/common/layout';
import { resolveRepositoryRoots } from '@/corpus';
import type { ICorpusRoot } from '@/corpus';
import { Transport } from '@/protocol';
import type { IToolHandler } from '@/protocol';
import { ReleaseStore } from '@/releases';
import type { ChunkStore } from '@/search/store';
import { SymbolStore } from '@/symbols';
import {
  buildChangesTool,
  buildGetTool,
  buildSearchTool,
  buildSymbolTool,
  buildVersionTool,
} from '@/tools';
import { getError } from '@venizia/ignis-helpers/core';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FreshnessGuard } from './server/freshness';

/** Repo mode's three live-tree roots, or snapshot mode's two packaged roots - `knowledge` is never shipped. */
const resolveRoots = (opts: { mode: TAtlasMode; root: string }): ICorpusRoot[] => {
  const { mode, root } = opts;

  if (mode === AtlasModes.REPOSITORY) {
    if (!isRepositoryCheckout({ root })) {
      throw getError({ message: `[resolveRoots] not an IGNIS checkout | root: ${root}` });
    }

    return resolveRepositoryRoots({ repositoryRoot: root });
  }

  const snapshotDirectory = join(root, SNAPSHOT_DIRECTORY);
  if (!existsSync(snapshotDirectory)) {
    throw getError({ message: `[resolveRoots] no packaged snapshot | root: ${root}` });
  }

  return [
    { corpus: Corpora.WIKI, directory: join(snapshotDirectory, 'wiki') },
    { corpus: Corpora.CHANGELOG, directory: join(snapshotDirectory, 'changelogs') },
  ];
};

/**
 * Wraps a tool builder so every call asks `guard` for the current store first. The definition
 * (name, description, schema) never changes with the store, so it is fixed once at `initialStore`;
 * only `call` re-resolves the store, picking up a rebuild the next time a client calls in.
 */
const buildGuardedTool = (opts: {
  guard: FreshnessGuard;
  initialStore: ChunkStore;
  build: (opts: { store: ChunkStore }) => IToolHandler;
}): IToolHandler => {
  const { guard, initialStore, build } = opts;

  return {
    definition: build({ store: initialStore }).definition,
    call: async ({ args }) => build({ store: guard.getStore() }).call({ args }),
  };
};

/**
 * Builds the MCP transport for one session. Repo mode indexes the live tree and re-checks
 * freshness on every tool call; snapshot mode indexes the packaged corpus once, immutably.
 */
/** `<family>-atlas` for a family checkout; the IGNIS name when the manifest is not one. */
const serverNameOf = (opts: { root: string }): string => {
  const family = workspaceFamilyOf({ root: opts.root });
  return family === undefined ? AtlasConstants.SERVER_NAME : `${family}-atlas`;
};

export const buildServer = (opts: {
  mode: TAtlasMode;
  root: string;
  version: string;
}): Transport => {
  const { mode, root, version } = opts;
  const guard = new FreshnessGuard({ mode, roots: resolveRoots({ mode, root }) });
  const initialStore = guard.getStore();
  // Built once: both generated tables come from outside the corpus, so its freshness never moves
  // them - the symbol table from `dist`, the release table from `git log`.
  const symbols = SymbolStore.load({ mode, root });
  const releases = ReleaseStore.load({ mode, root });

  return new Transport({
    tools: [
      buildGuardedTool({
        guard,
        initialStore,
        build: ({ store }) => buildSearchTool({ store, symbols }),
      }),
      buildGuardedTool({ guard, initialStore, build: buildGetTool }),
      buildGuardedTool({
        guard,
        initialStore,
        build: ({ store }) => buildSymbolTool({ store, symbols }),
      }),
      buildVersionTool({ releases }),
      buildChangesTool({ releases }),
    ],
    // A family checkout names its own server (`ardor-atlas` in the ARDOR repo); the packaged
    // snapshot is always IGNIS's, so it keeps the package's name.
    serverName:
      mode === AtlasModes.REPOSITORY ? serverNameOf({ root }) : AtlasConstants.SERVER_NAME,
    serverVersion: version,
  });
};

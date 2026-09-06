import { AtlasModes } from '@/common';
import type { TAtlasMode } from '@/common';
import { Chunker, CorpusLoader } from '@/corpus';
import type { ICorpusRoot } from '@/corpus';
import { ChunkStore } from '@/search/store';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import { statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Total `.md` files, the newest mtime, and total bytes across every corpus root - cheap enough to
 * compute before every tool call. Total bytes catches a same-count file swap that preserves mtime
 * (a build step that overwrites a file's content without touching its timestamp); a pure rename -
 * identical bytes, identical mtime, only the path changes - still stays invisible, since nothing
 * here reads the path itself.
 */
interface ICorpusFingerprint {
  count: number;
  newestMtimeMs: number;
  totalBytes: number;
}

/** Mirrors `CorpusLoader`'s own exclude semantics: an excluded relative path, or anything under it, is never counted. */
const isExcluded = (opts: { relativePath: string; exclude: string[] }): boolean =>
  opts.exclude.some(
    prefix => opts.relativePath === prefix || opts.relativePath.startsWith(`${prefix}/`),
  );

/** One glob walk per root; `statSync` runs only for files already known to belong to the corpus. */
const fingerprintOf = (opts: { roots: ICorpusRoot[] }): ICorpusFingerprint => {
  let count = 0;
  let newestMtimeMs = 0;
  let totalBytes = 0;

  for (const root of opts.roots) {
    const exclude = root.exclude ?? [];
    const relativePaths = new Bun.Glob('**/*.md').scanSync({ cwd: root.directory });

    for (const relativePath of relativePaths) {
      if (isExcluded({ relativePath, exclude })) {
        continue;
      }

      count += 1;
      const { mtimeMs, size } = statSync(join(root.directory, relativePath));
      newestMtimeMs = Math.max(newestMtimeMs, mtimeMs);
      totalBytes += size;
    }
  }

  return { count, newestMtimeMs, totalBytes };
};

const sameFingerprint = (opts: { left: ICorpusFingerprint; right: ICorpusFingerprint }): boolean =>
  opts.left.count === opts.right.count &&
  opts.left.newestMtimeMs === opts.right.newestMtimeMs &&
  opts.left.totalBytes === opts.right.totalBytes;

const buildStore = (opts: { roots: ICorpusRoot[] }): ChunkStore => {
  const chunker = Chunker.getInstance();
  const documents = CorpusLoader.getInstance().load({ roots: opts.roots });

  const store = new ChunkStore();
  store.add({ chunks: documents.flatMap(document => chunker.chunk({ document })) });
  return store;
};

/**
 * Keeps one `ChunkStore` current for a fixed set of `roots`. Repo mode fingerprints the corpus
 * (file count plus newest mtime, one glob walk per root) before every `getStore()` and rebuilds -
 * new loader pass, new chunker pass, new store, the old one `close()`d - when it moved, so a long
 * session never answers from documents it has already outlived. Snapshot mode never rebuilds: the
 * packaged corpus is immutable for the life of the process.
 */
export class FreshnessGuard extends BaseHelper {
  private readonly mode: TAtlasMode;
  private readonly roots: ICorpusRoot[];
  private store: ChunkStore;
  private lastFingerprint?: ICorpusFingerprint;

  constructor(opts: { mode: TAtlasMode; roots: ICorpusRoot[] }) {
    super({ scope: FreshnessGuard.name });

    this.mode = opts.mode;
    this.roots = opts.roots;
    this.store = buildStore({ roots: this.roots });
    this.lastFingerprint = this.watches() ? this.fingerprint() : undefined;
  }

  /** The corpus fingerprint right now - one glob walk per root, no rebuild. */
  fingerprint(): ICorpusFingerprint {
    return fingerprintOf({ roots: this.roots });
  }

  /** The current store; in repo mode, rebuilds first when the fingerprint has moved since the last call. */
  getStore(): ChunkStore {
    if (!this.watches()) {
      return this.store;
    }

    const next = this.fingerprint();
    if (this.lastFingerprint && sameFingerprint({ left: this.lastFingerprint, right: next })) {
      return this.store;
    }

    const startedAt = performance.now();
    const stale = this.store;
    this.store = buildStore({ roots: this.roots });
    this.lastFingerprint = next;
    stale.close();

    this.logger
      .for('getStore')
      .info(`rebuilt the index | ms: ${(performance.now() - startedAt).toFixed(1)}`);

    return this.store;
  }

  private watches(): boolean {
    return this.mode === AtlasModes.REPO;
  }
}

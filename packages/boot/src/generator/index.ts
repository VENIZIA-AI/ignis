import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { IScannedArtifact } from './common';
import { ArtifactIndexEmitter } from './emitter';
import { ArtifactScanner } from './scanner';

export interface IGenerateOptions {
  root: string;
  out: string;
  ignore?: string[];
  /** Name of the exported constant; default `GeneratedArtifacts`. */
  exportName?: string;
}

const render = (opts: IGenerateOptions): { content: string; artifacts: IScannedArtifact[] } => {
  const artifacts = ArtifactScanner.getInstance().scan({ root: opts.root, ignore: opts.ignore });
  const content = ArtifactIndexEmitter.render({
    artifacts,
    outFile: resolve(opts.out),
    exportName: opts.exportName ?? 'GeneratedArtifacts',
  });

  return { content, artifacts };
};

/** Writes the index only when its content changed, so an unchanged tree leaves the file's mtime alone. */
export const generateArtifactIndex = (
  opts: IGenerateOptions,
): { content: string; artifacts: IScannedArtifact[]; written: boolean } => {
  const { content, artifacts } = render(opts);
  const out = resolve(opts.out);
  const current = existsSync(out) ? readFileSync(out, 'utf8') : undefined;

  if (current === content) {
    return { content, artifacts, written: false };
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);

  return { content, artifacts, written: true };
};

/** Renders in memory and compares with the committed file - the staleness gate for lint and CI. */
export const checkArtifactIndex = (
  opts: IGenerateOptions,
): { isFresh: boolean; expected: string; actual: string | undefined } => {
  const { content: expected } = render(opts);
  const out = resolve(opts.out);
  const actual = existsSync(out) ? readFileSync(out, 'utf8') : undefined;

  return { isFresh: actual === expected, expected, actual };
};

export * from './common';
export * from './emitter';
export * from './scanner';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { IScanReport, IScannedArtifact } from './common';
import { ArtifactIndexEmitter } from './emitter';
import { ArtifactScanner } from './scanner';

export interface IGenerateOptions {
  root: string;
  out: string;
  ignore?: string[];
  /** Name of the exported constant; default `GeneratedArtifacts`. */
  exportName?: string;
}

const render = (opts: IGenerateOptions): { content: string } & IScanReport => {
  const { artifacts, ignored } = ArtifactScanner.getInstance().scanWithReport({
    root: opts.root,
    ignore: opts.ignore,
  });
  const content = ArtifactIndexEmitter.render({
    artifacts,
    outFile: resolve(opts.out),
    exportName: opts.exportName ?? ArtifactIndexEmitter.DEFAULT_EXPORT_NAME,
    command: { root: opts.root, out: opts.out, ignore: opts.ignore },
  });

  return { content, artifacts, ignored };
};

/** Writes the index only when its content changed, so an unchanged tree leaves the file's mtime alone. */
export const generateArtifactIndex = (
  opts: IGenerateOptions,
): { content: string; written: boolean } & IScanReport => {
  const { content, artifacts, ignored } = render(opts);
  const out = resolve(opts.out);
  const current = existsSync(out) ? readFileSync(out, 'utf8') : undefined;

  if (current === content) {
    return { content, artifacts, ignored, written: false };
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);

  return { content, artifacts, ignored, written: true };
};

/** Everything below the first line: the header only records the command, so a flag change alone must not read as drift. */
const bodyOf = (content: string): string => content.slice(content.indexOf('\n') + 1);

/** Renders in memory and compares the body with the committed file - the staleness gate for lint and CI. */
export const checkArtifactIndex = (
  opts: IGenerateOptions,
): {
  isFresh: boolean;
  expected: string;
  actual: string | undefined;
  ignored: IScannedArtifact[];
} => {
  const { content: expected, ignored } = render(opts);
  const out = resolve(opts.out);
  const actual = existsSync(out) ? readFileSync(out, 'utf8') : undefined;
  const isFresh = actual !== undefined && bodyOf(actual) === bodyOf(expected);

  return { isFresh, expected, actual, ignored };
};

export * from './common';
export * from './emitter';
export * from './scanner';

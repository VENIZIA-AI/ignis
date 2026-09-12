import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BuildInfoFormats, type IBuildInfoOptions, type IBuildInfoResult } from './common';
import { BuildInfoEmitter } from './emitter';
import { BuildInfoResolver } from './resolver';

/**
 * Writes the stamp. Unlike the artifact index this ALWAYS writes: `builtAt` changes every run, so
 * an unchanged-content short-circuit would be dead code that hides a stale timestamp.
 */
export const generateBuildInfo = async (opts: IBuildInfoOptions): Promise<IBuildInfoResult> => {
  const buildInfo = await BuildInfoResolver.getInstance().resolve({ root: opts.root });
  const content = BuildInfoEmitter.render({
    buildInfo,
    format: opts.format ?? BuildInfoFormats.TS,
    exportName: opts.exportName ?? BuildInfoEmitter.DEFAULT_EXPORT_NAME,
  });

  const out = resolve(opts.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);

  return { buildInfo, content, out };
};

export * from './common';
export * from './emitter';
export * from './resolver';

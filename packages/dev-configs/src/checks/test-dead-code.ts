import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';

/**
 * Support files of the tests (fixtures, helpers, probes) that no other file refers to. The second
 * step of the trim-tests method. The output is CANDIDATES: a fixture can be loaded by a path built at
 * run time or by scanning a folder, so a candidate is deleted only after the package suite is green
 * without it.
 */
export interface IDeadTestCodeCandidate {
  file: string;
  /**
   * `unreferenced`: neither its name nor its path under `__tests__` appears in another file, nor does
   * its folder. `folder-referenced`: only its folder path does, so a scan of that folder may load it.
   */
  kind: 'unreferenced' | 'folder-referenced';
}

const SUPPORT_EXTENSION = /\.(?:[cm]?[jt]sx?|json|sql|txt)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

const git = (opts: { root: string; args: string[] }): { status: number; stdout: string } => {
  const result = spawnSync('git', opts.args, {
    cwd: opts.root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? '' };
};

/** Files other than `self` whose text contains `needle` (a fixed string). */
const referencedElsewhere = (opts: { root: string; needle: string; self: string }): boolean => {
  const result = git({ root: opts.root, args: ['grep', '-l', '-I', '-F', '-e', opts.needle] });
  return result.stdout.split('\n').some((line) => line !== '' && line !== opts.self);
};

const escapeForRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Files other than `self` that mention the name of the file as a path segment or an import. */
const nameReferencedElsewhere = (opts: { root: string; stem: string; self: string }): boolean => {
  const pattern = `[/'"\`]${escapeForRegex(opts.stem)}(\\.|'|"|\`|$)`;
  const result = git({ root: opts.root, args: ['grep', '-l', '-I', '-E', '-e', pattern] });
  return result.stdout.split('\n').some((line) => line !== '' && line !== opts.self);
};

export const findDeadTestCode = (opts: { root: string }): IDeadTestCodeCandidate[] => {
  const tracked = git({ root: opts.root, args: ['ls-files'] }).stdout.split('\n');
  const support = tracked.filter(
    (file) =>
      file.includes('/__tests__/') &&
      SUPPORT_EXTENSION.test(file) &&
      !TEST_FILE.test(file) &&
      !file.endsWith('.d.ts'),
  );
  const candidates: IDeadTestCodeCandidate[] = [];

  for (const file of support) {
    const underTests = file.slice(file.indexOf('/__tests__/') + '/__tests__/'.length);
    const stem = underTests.split('/').pop()!.replace(SUPPORT_EXTENSION, '');
    const withoutExtension = underTests.replace(SUPPORT_EXTENSION, '');

    if (
      nameReferencedElsewhere({ root: opts.root, stem, self: file }) ||
      referencedElsewhere({ root: opts.root, needle: withoutExtension, self: file })
    ) {
      continue;
    }

    const folder = dirname(underTests);
    const folderReferenced =
      folder !== '.' && referencedElsewhere({ root: opts.root, needle: folder, self: file });

    candidates.push({ file, kind: folderReferenced ? 'folder-referenced' : 'unreferenced' });
  }

  return candidates;
};

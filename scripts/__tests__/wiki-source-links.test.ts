import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SourceLinkCheck } from '../wiki-source-links';

const tmpDirs: string[] = [];

const writeFixture = (opts: { root: string; relPath: string; content: string }): void => {
  const full = join(opts.root, opts.relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, opts.content);
};

// `git init` + `git add` (no commit) is enough - `git ls-files` reads the index, and this repo is
// disposable, unrelated to the outer IGNIS checkout.
const makeTrackedRepo = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-wiki-source-links-'));
  tmpDirs.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });

  writeFixture({ root, relPath: 'packages/x/y.ts', content: 'export const y = 1;\n' });
  writeFixture({
    root,
    relPath: 'docs/a.md',
    content: [
      '# Doc',
      '',
      'Tracked: https://github.com/VENIZIA-AI/ignis/blob/main/packages/x/y.ts',
      'Untracked: https://github.com/VENIZIA-AI/ignis/blob/main/packages/x/missing.ts',
      'Directory: https://github.com/VENIZIA-AI/ignis/tree/main/packages/x',
      'Backtick: `packages/x/y.ts:42`',
      'External: https://github.com/other/repo/blob/main/packages/z.ts',
      '',
    ].join('\n'),
  });
  writeFixture({
    root,
    relPath: 'docs/changelogs/old.md',
    content: ['# Changelog', '', 'Skipped prose: `packages/x/gone.ts`', ''].join('\n'),
  });
  writeFixture({
    root,
    relPath: '.agents/knowledge/concept.md',
    content: [
      '---',
      'title: Test concept',
      'resource: packages/x/y.ts',
      '---',
      '',
      'Body.',
      '',
    ].join('\n'),
  });

  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
};

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('SourceLinkCheck.run', () => {
  let result: { checked: number; missing: { file: string; line: number; path: string }[] };

  beforeAll(() => {
    const repoRoot = makeTrackedRepo();
    const check = SourceLinkCheck.fromDirectories({
      dirs: ['docs', '.agents/knowledge'],
      skipProseUnder: ['docs/changelogs'],
      repoRoot,
    });
    result = check.run();
  });

  test('flags the untracked GitHub link as missing, and nothing else', () => {
    expect(result.missing).toEqual([{ file: 'docs/a.md', line: 4, path: 'packages/x/missing.ts' }]);
  });

  test('counts the tracked link, directory link, backtick path and frontmatter resource', () => {
    expect(result.checked).toBe(5);
  });
});

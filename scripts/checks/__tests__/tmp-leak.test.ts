import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TmpLeak } from '../tmp-leak/tmp-leak';

const roots: string[] = [];

const makeFolders = () => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-tmp-leak-'));
  roots.push(root);
  const systemTmp = join(root, 'system');
  const repoTmp = join(root, 'repo');
  mkdirSync(systemTmp);
  mkdirSync(repoTmp);
  return { systemTmp, repoTmp };
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('TmpLeak', () => {
  test('a run that adds nothing is clean', () => {
    const folders = makeFolders();
    mkdirSync(join(folders.systemTmp, 'old'));
    TmpLeak.snapshot(folders);

    expect(TmpLeak.verify(folders)).toEqual({ leaks: [], allowed: [] });
  });

  test('reports a new entry in the system temp and in the repository temp', () => {
    const folders = makeFolders();
    TmpLeak.snapshot(folders);
    mkdirSync(join(folders.systemTmp, 'surface-test-abc123'));
    writeFileSync(join(folders.repoTmp, 'left.txt'), '');

    const { leaks } = TmpLeak.verify(folders);

    expect(leaks).toHaveLength(2);
    expect(leaks[0]).toContain('surface-test-abc123');
    expect(leaks[1]).toContain('left.txt');
  });

  test('ignores dot files and names the ignore pattern matches', () => {
    const folders = makeFolders();
    TmpLeak.snapshot(folders);
    writeFileSync(join(folders.systemTmp, '.X0-lock'), '');
    mkdirSync(join(folders.systemTmp, 'claude-1000'));

    expect(TmpLeak.verify({ ...folders, ignore: /^claude-/ }).leaks).toEqual([]);
  });

  test('a system entry made before the snapshot is not the run work', () => {
    const folders = makeFolders();
    TmpLeak.snapshot(folders);
    const path = join(folders.systemTmp, 'older');
    mkdirSync(path);
    // utimes moves mtime/atime; ctime cannot be set, so the check uses a snapshot time far ahead
    utimesSync(path, new Date(0), new Date(0));

    expect(TmpLeak.madeByRun({ path, since: Date.now() + 60_000 })).toBe(false);
    expect(TmpLeak.madeByRun({ path, since: Date.now() })).toBe(true);
    expect(TmpLeak.madeByRun({ path: join(folders.systemTmp, 'gone'), since: 0 })).toBe(false);
  });

  test('a sanctioned system path is listed as allowed and does not fail', () => {
    const folders = makeFolders();
    TmpLeak.snapshot(folders);
    mkdirSync(join(folders.systemTmp, 'ignis-clean-install-x1'));

    const { leaks, allowed } = TmpLeak.verify(folders);

    expect(leaks).toEqual([]);
    expect(allowed).toEqual([join(folders.systemTmp, 'ignis-clean-install-x1')]);
  });

  test('throws when verify runs without a snapshot', () => {
    const folders = makeFolders();

    expect(() => TmpLeak.verify(folders)).toThrow('no snapshot');
  });
});

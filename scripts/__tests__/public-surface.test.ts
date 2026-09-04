import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PublicSurface } from '../public-surface';

const tmpDirs: string[] = [];

const SURFACE_BASE = [
  'export declare class A {}',
  'export interface B {',
  '  x: number;',
  '}',
  'export declare const c: number;',
];

const makeRepoRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-public-surface-'));
  tmpDirs.push(root);
  const packageDir = join(root, 'packages', 'testpkg');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify({ name: '@test/testpkg', exports: { '.': { types: './index.d.ts' } } }),
  );
  return root;
};

const writeSurface = (opts: { repoRoot: string; extraLines?: string[] }): void => {
  const body = [...SURFACE_BASE, ...(opts.extraLines ?? []), ''].join('\n');
  writeFileSync(join(opts.repoRoot, 'packages', 'testpkg', 'index.d.ts'), body);
};

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('PublicSurface.render', () => {
  test('lists an exported class, interface and const with their kinds', () => {
    const repoRoot = makeRepoRoot();
    writeSurface({ repoRoot });

    const rendered = PublicSurface.render({ repoRoot, packages: ['testpkg'] });

    expect(rendered).toContain('- `A` class');
    expect(rendered).toContain('- `B` interface');
    expect(rendered).toContain('- `c` const');
  });
});

describe('PublicSurface.check', () => {
  test('is fresh right after a snapshot, and stale once an export is added', () => {
    const repoRoot = makeRepoRoot();
    const outputPath = join(repoRoot, 'public-surface.md');
    writeSurface({ repoRoot });
    writeFileSync(outputPath, PublicSurface.render({ repoRoot, packages: ['testpkg'] }));

    expect(PublicSurface.check({ repoRoot, packages: ['testpkg'], outputPath })).toBe(true);

    writeSurface({ repoRoot, extraLines: ['export declare const d: number;'] });

    expect(PublicSurface.check({ repoRoot, packages: ['testpkg'], outputPath })).toBe(false);
  });
});

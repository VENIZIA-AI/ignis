import './kernel-stub';
import { GroupArtifactsResolver, IgnisArtifactsPlugin } from '@/bun';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CORE = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'groups', 'core');
const GROUPS_FILE = resolve(CORE, 'src', 'groups.ts');
const names = (classes: ReadonlyArray<{ name: string }> | undefined): string[] =>
  (classes ?? []).map(target => target.name);

describe('GroupArtifactsResolver (source runs)', () => {
  test('a group resolves to the decorated classes under its folder in the defining package, and nothing else', async () => {
    const index = await GroupArtifactsResolver.resolve({
      group: { folder: 'inventory', site: GROUPS_FILE },
    });
    expect(names(index.services)).toEqual(['StockService']);
    expect(names(index.repositories)).toEqual(['StockRepository']);
  });

  test('install fills the kernel realm slot the group resolver is read from', () => {
    GroupArtifactsResolver.install();
    const slot = (globalThis as Record<symbol, { resolve?: unknown }>)[
      Symbol.for('@venizia/ignis-kernel:artifact-group-resolver')
    ];
    expect(typeof slot?.resolve).toBe('function');
  });

  test('a group with no site is an error naming the folder', async () => {
    expect(
      GroupArtifactsResolver.resolve({ group: { folder: 'inventory', site: undefined } }),
    ).rejects.toThrow(/'inventory'/);
  });
});

describe('IgnisArtifactsPlugin.rewriteGroups (builds)', () => {
  test('each define call gets its classes inlined as content, imported by absolute path', () => {
    const rewritten = IgnisArtifactsPlugin.rewriteGroups({
      filePath: GROUPS_FILE,
      source: readFileSync(GROUPS_FILE, 'utf8'),
    });
    expect(rewritten).toContain(
      `from '${resolve(CORE, 'src', 'services', 'inventory', 'stock.service')}'`,
    );
    const local = (name: string): string | undefined =>
      rewritten.match(new RegExp(`import \\{ ${name} as (\\w+) \\}`))?.[1];
    expect(rewritten).toContain(
      `define({ folder: 'inventory', content: { repositories: [${local('StockRepository')}], services: [${local('StockService')}] }`,
    );
    expect(rewritten).toContain(
      `define({ folder: 'commerce', content: { services: [${local('CategoryService')}] }`,
    );
  });

  test('a folder with no decorated class fails the build with the folder named', () => {
    const source =
      "import { ArtifactGroup } from '@venizia/ignis-kernel';\nexport const Empty = ArtifactGroup.define({ folder: 'empty-domain' });\n";
    expect(() => IgnisArtifactsPlugin.rewriteGroups({ filePath: GROUPS_FILE, source })).toThrow(
      /'empty-domain' resolved to no class/,
    );
  });
});

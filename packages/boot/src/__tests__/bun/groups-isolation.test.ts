import './kernel-stub';
import { GroupArtifactsResolver } from '@/bun';
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

// A second file resolving the same group: under --isolate --parallel each file gets a fresh realm and must still see the same content.
const GROUPS_FILE = resolve(
  process.cwd(),
  'src',
  '__tests__',
  'fixtures',
  'groups',
  'core',
  'src',
  'groups.ts',
);

test('the inventory group resolves to the same classes in an isolated file', async () => {
  const index = await GroupArtifactsResolver.resolve({
    group: { folder: 'inventory', site: GROUPS_FILE },
  });
  expect((index.services ?? []).map((target) => target.name)).toEqual(['StockService']);
  expect((index.repositories ?? []).map((target) => target.name)).toEqual(['StockRepository']);
});

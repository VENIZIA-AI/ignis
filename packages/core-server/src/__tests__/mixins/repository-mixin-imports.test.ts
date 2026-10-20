import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

// `helpers/inversion` moved to the kernel package - the invariant this guards (no connectors
// import, relation building only through the registry) still belongs to core's suite since it is
// what keeps the mixin severable from drizzle-orm.
const MIXIN_PATH = join(
  __dirname,
  '../../../../kernel/src/helpers/inversion/mixins/repository.mixin.ts',
);

describe('repository mixin', () => {
  test('imports nothing from the connectors tree', async () => {
    const source = await Bun.file(MIXIN_PATH).text();

    expect(source).not.toMatch(/from '@\/connectors\//);
  });

  test('resolves the relation builder through the registry', async () => {
    const source = await Bun.file(MIXIN_PATH).text();

    expect(source).toMatch(/RelationBuilderRegistry\.resolve\(\)/);
  });
});

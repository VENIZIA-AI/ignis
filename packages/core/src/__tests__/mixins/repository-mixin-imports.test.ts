import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const MIXIN_PATH = join(__dirname, '../../helpers/inversion/mixins/repository.mixin.ts');

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

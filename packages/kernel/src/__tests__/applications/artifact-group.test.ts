import { ArtifactGroup } from '@/base/applications/artifact-group';
import { ArtifactIndexHelper } from '@/base/applications/artifact-index';
import type { IArtifactGroup, TArtifactIndexInput } from '@/base/applications/common';
import { afterEach, describe, expect, test } from 'bun:test';

const helper = ArtifactIndexHelper.getInstance();
const application = {};

class StockService {}
class StockController {}

afterEach(() => {
  ArtifactGroup.setResolver({ resolve: undefined });
});

describe('ArtifactGroup.define', () => {
  test('records its folder and the file that called define', () => {
    const group = ArtifactGroup.define({ folder: 'inventory' });
    expect(group.folder).toBe('inventory');
    expect(group.site).toEndWith('artifact-group.test.ts');
  });

  test('isGroup recognises the group protocol by its brand, a plain index is not a group', () => {
    expect(ArtifactGroup.isGroup(ArtifactGroup.define({ folder: 'inventory' }))).toBe(true);
    expect(ArtifactGroup.isGroup({ services: [StockService] })).toBe(false);
  });

  test('reading a kind off a group throws instead of reading as empty', () => {
    const group = ArtifactGroup.define({ folder: 'inventory' });
    expect(() => group.services).toThrow(/'inventory' is resolved when artifacts are registered/);
  });
});

describe('ArtifactIndexHelper.flatten - groups', () => {
  test('a group whose content was inlined at build flattens to that content', async () => {
    const content = { services: [StockService] };
    const group = ArtifactGroup.define({ folder: 'inventory', content });
    expect(await helper.flatten({ input: group, application })).toEqual([content]);
  });

  test('a group without content flattens to what the global resolver answers', async () => {
    ArtifactGroup.setResolver({ resolve: async () => ({ services: [StockService] }) });
    const group = ArtifactGroup.define({ folder: 'inventory' });
    expect(await helper.flatten({ input: group, application })).toEqual([
      { services: [StockService] },
    ]);
  });

  test('a protocol object with its own resolve is resolved through it (the auto group)', async () => {
    const auto: IArtifactGroup = {
      isArtifactGroup: true,
      folder: undefined,
      site: undefined,
      content: undefined,
      resolve: async () => ({ controllers: [StockController] }),
    };
    expect(await helper.flatten({ input: [auto], application })).toEqual([
      { controllers: [StockController] },
    ]);
  });

  test('a group without content and without a resolver names the fix', async () => {
    const group = ArtifactGroup.define({ folder: 'inventory' });
    expect(helper.flatten({ input: group, application })).rejects.toThrow(
      /@venizia\/ignis-boot\/auto/,
    );
  });

  test('a group that resolves to no class is an error naming the folder', async () => {
    ArtifactGroup.setResolver({ resolve: async () => ({ services: [] }) });
    const group = ArtifactGroup.define({ folder: 'inventory' });
    expect(helper.flatten({ input: group, application })).rejects.toThrow(
      /'inventory' resolved to no class/,
    );
  });

  test('resolve registers a group\x27s classes beside the other entries', async () => {
    ArtifactGroup.setResolver({ resolve: async () => ({ controllers: [StockController] }) });
    const input: TArtifactIndexInput = [
      { services: [StockService] },
      ArtifactGroup.define({ folder: 'inventory' }),
    ];
    const resolved = await helper.resolve({ input, application });
    expect(resolved.services).toEqual([StockService]);
    expect(resolved.controllers).toEqual([StockController]);
  });
});

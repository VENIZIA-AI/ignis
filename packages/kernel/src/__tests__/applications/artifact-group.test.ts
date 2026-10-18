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

describe('ArtifactGroup.siteFromStack', () => {
  const stack = (...frames: string[]): string =>
    ['Error', ...frames.map(frame => `    at ${frame}`)].join('\n');

  test('skips only the kernel\x27s own artifact-group file, matched on a path separator', () => {
    expect(
      ArtifactGroup.siteFromStack({
        stack: stack(
          'define (/k/base/applications/artifact-group.js:20:5)',
          '<anonymous> (/pkg/src/inventory-artifact-group.ts:3:9)',
        ),
      }),
    ).toBe('/pkg/src/inventory-artifact-group.ts');
  });

  test('reads a Windows path and decodes a file URL with its drive', () => {
    expect(
      ArtifactGroup.siteFromStack({
        stack: stack('define (C:\\k\\artifact-group.js:1:1)', 'x (C:\\pkg\\src\\groups.ts:3:4)'),
      }),
    ).toBe('C:\\pkg\\src\\groups.ts');
    expect(
      ArtifactGroup.siteFromStack({
        stack: stack(
          'define (file:///k/artifact-group.js:1:1)',
          'x (file:///C:/pkg/src/my%20groups.ts:1:1)',
        ),
      }),
    ).toBe('C:/pkg/src/my groups.ts');
  });

  test('keeps parentheses inside the path', () => {
    expect(
      ArtifactGroup.siteFromStack({
        stack: stack('define (/k/artifact-group.ts:1:1)', 'x (/pkg/src/(domain)/groups.ts:2:2)'),
      }),
    ).toBe('/pkg/src/(domain)/groups.ts');
  });
});

describe('ArtifactGroup.pick', () => {
  test('slices an inlined group to the named kinds', async () => {
    const group = ArtifactGroup.define({
      folder: 'inventory',
      content: { services: [StockService], controllers: [StockController] },
    });
    const slice = ArtifactGroup.pick({ group, kinds: ['controllers'] });
    expect(await helper.flatten({ input: slice, application })).toEqual([
      { controllers: [StockController] },
    ]);
  });

  test('a resolver-backed group is resolved when artifacts are registered, not when picked', async () => {
    let calls = 0;
    ArtifactGroup.setResolver({
      resolve: async () => {
        calls += 1;
        return { services: [StockService], controllers: [StockController] };
      },
    });
    const slice = ArtifactGroup.pick({
      group: ArtifactGroup.define({ folder: 'inventory' }),
      kinds: ['services'],
    });
    expect(calls).toBe(0);
    expect(await helper.flatten({ input: slice, application })).toEqual([
      { services: [StockService] },
    ]);
    expect(calls).toBe(1);
  });

  test('a slice whose kinds hold no class is an empty index, not an error', async () => {
    const group = ArtifactGroup.define({
      folder: 'inventory',
      content: { services: [StockService] },
    });
    const slice = ArtifactGroup.pick({ group, kinds: ['controllers'] });
    expect(await helper.flatten({ input: slice, application })).toEqual([{}]);
  });

  test('slices a protocol object with its own resolve (the auto group), and stays a group', async () => {
    const auto: IArtifactGroup = {
      isArtifactGroup: true,
      folder: undefined,
      site: undefined,
      content: undefined,
      resolve: async () => ({ services: [StockService], controllers: [StockController] }),
    };
    const slice = ArtifactGroup.pick({ group: auto, kinds: ['services'] });
    expect(ArtifactGroup.isGroup(slice)).toBe(true);
    expect(await helper.flatten({ input: [slice], application })).toEqual([
      { services: [StockService] },
    ]);
  });
});

describe('ArtifactGroup.application', () => {
  test('covers the calling package: no folder, the call site recorded, resolved through the installed resolver', async () => {
    const group = ArtifactGroup.application();
    expect(group.folder).toBeUndefined();
    expect(group.site).toEndWith('artifact-group.test.ts');

    ArtifactGroup.setResolver({
      resolve: async ({ group: target }) =>
        target.folder === undefined ? { services: [StockService] } : {},
    });
    expect(await helper.flatten({ input: group, application })).toEqual([
      { services: [StockService] },
    ]);
  });

  test('hands its ignore patterns to the resolver', async () => {
    const group = ArtifactGroup.application({ ignore: ['repositories/clickhouse/**'] });
    expect(group.ignore).toEqual(['repositories/clickhouse/**']);

    ArtifactGroup.setResolver({
      resolve: async ({ group: target }) =>
        target.ignore?.includes('repositories/clickhouse/**') ? { services: [StockService] } : {},
    });
    expect(await helper.flatten({ input: group, application })).toEqual([
      { services: [StockService] },
    ]);
  });

  test('takes content inlined by a build', async () => {
    const group = ArtifactGroup.application({ content: { controllers: [StockController] } });
    expect(await helper.flatten({ input: group, application })).toEqual([
      { controllers: [StockController] },
    ]);
  });
});

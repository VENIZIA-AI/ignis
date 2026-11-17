// The kernel's ArtifactGroup and @venizia/ignis-boot's resolver and auto group, together - neither package depends on the other.
import AutoArtifacts from '@venizia/ignis-boot/auto';
import { AutoArtifactGroup, GroupArtifactsResolver } from '@venizia/ignis-boot/bun';
import type { TGeneratedArtifactIndex } from '@venizia/ignis-boot/generator';
import { ArtifactGroup, BaseConfiguration, type IArtifactGroup } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';

import { BillingArtifacts } from './fixtures/group-package/src/groups';

describe('auto artifacts across the kernel and boot', () => {
  test('a real kernel group records its site, and boot\x27s installed resolver fills it with the folder\x27s classes', async () => {
    expect(BillingArtifacts.site).toEndWith('/group-package/src/groups.ts');

    GroupArtifactsResolver.install();
    const resolve = ArtifactGroup.getResolver();

    if (!resolve) {
      throw new Error('boot did not install the group resolver');
    }

    const index = await resolve({ group: BillingArtifacts });
    expect((index.services ?? []).map((target) => target.name)).toEqual(['InvoiceService']);
  });

  test('boot\x27s AutoArtifactGroup is the kernel\x27s group protocol', () => {
    const typed: IArtifactGroup = new AutoArtifactGroup({ resolve: async () => ({}) });
    expect(ArtifactGroup.isGroup(typed)).toBe(true);
    expect(() => typed.services).toThrow();
  });

  test('the generated index type and the auto default export are the kernel\x27s group: the default path', () => {
    const index: TGeneratedArtifactIndex = {};
    const fromIndex: IArtifactGroup = new AutoArtifactGroup({ content: index });
    const fromAuto: IArtifactGroup = AutoArtifacts;

    expect(ArtifactGroup.isGroup(fromIndex)).toBe(true);
    expect(ArtifactGroup.isGroup(fromAuto)).toBe(true);
  });

  test('a group built from an index of real classes keeps their types and is still the kernel\x27s group', () => {
    class ServerConfiguration extends BaseConfiguration {}

    const group: IArtifactGroup = new AutoArtifactGroup({
      content: { configurations: [ServerConfiguration] },
    });

    expect(ArtifactGroup.isGroup(group)).toBe(true);
  });

  test('an index whose configurations are not configurations is rejected by the kernel type', () => {
    class NotAConfiguration {}

    // @ts-expect-error - NotAConfiguration is not a BaseConfiguration, so the group is not an IArtifactGroup
    const group: IArtifactGroup = new AutoArtifactGroup({
      content: { configurations: [NotAConfiguration] },
    });

    expect(ArtifactGroup.isGroup(group)).toBe(true);
  });
});

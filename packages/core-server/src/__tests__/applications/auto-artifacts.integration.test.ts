// The kernel's ArtifactGroup and @venizia/ignis-boot's resolver and auto group, together - neither package depends on the other.
import { AutoArtifactGroup, GroupArtifactsResolver } from '@venizia/ignis-boot/bun';
import { ArtifactGroup, type IArtifactGroup } from '@venizia/ignis-kernel';
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
});

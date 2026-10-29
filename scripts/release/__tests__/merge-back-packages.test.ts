import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ReleaseMergeBack } from '../merge-back';
import { ReleaseOrder } from '../release-constants';

const PACKAGES = join(import.meta.dir, '..', '..', '..', 'packages');

describe('the packages this repository releases, as merge-back.ts reads them', () => {
  test('every package of the release order has a top-level version line indented by two spaces', async () => {
    for (const folder of ReleaseOrder.NAMES) {
      const text = await Bun.file(join(PACKAGES, folder, 'package.json')).text();

      expect(ReleaseMergeBack.versionOf({ text })).toBeDefined();
    }
  });

  test('every folder under packages/ that has a package.json is in the release order', () => {
    const folders = readdirSync(PACKAGES).filter(
      (folder) => Bun.file(join(PACKAGES, folder, 'package.json')).size > 0,
    );

    expect([...folders].sort()).toEqual([...ReleaseOrder.NAMES].sort());
  });
});

import AutoArtifacts from '@venizia/ignis-boot/auto';
import { InventoryArtifacts } from '@fixture/core';

const names = (
  index: Record<string, ReadonlyArray<{ name: string }> | undefined> | undefined,
): string =>
  Object.values(index ?? {})
    .flatMap((classes) => (classes ?? []).map((target) => target.name))
    .sort()
    .join(',');

const own = await AutoArtifacts.resolve();
console.log(`own=${names(own)} inventory=${names(InventoryArtifacts.content)}`);

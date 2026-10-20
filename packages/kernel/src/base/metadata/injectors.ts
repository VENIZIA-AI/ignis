import { MetadataRegistry } from '@/helpers/inversion';
import { inject as coreInject } from '@venizia/ignis-inversion';
import type { TInjectOptions as TCoreInjectOptions } from '@venizia/ignis-inversion';

/** Distributes over the union, so `key` and `target` stay mutually exclusive - a bare `Omit` collapses the two branches into one shape declaring both. */
type TWithoutRegistry<T> = T extends unknown ? Omit<T, 'registry'> : never;

/**
 * Either a binding key or the class bound under it - never both. The shape is inversion's; the
 * `registry` member is not, because this wrapper is the one that supplies it.
 */
export type TInjectOptions = TWithoutRegistry<TCoreInjectOptions>;

/**
 * `@inject`, bound to the kernel's registry. The container reads
 * `MetadataRegistry.getInstance()` (`helpers/inversion/container.ts`), while inversion's own
 * `inject` writes to its module-level registry - metadata written there is never read back.
 */
export const inject = (opts: TInjectOptions) => {
  const registry = MetadataRegistry.getInstance();

  // Branched, not spread: spreading widens the union back into a shape declaring both members.
  if (opts.key === undefined) {
    return coreInject({ target: opts.target, isOptional: opts.isOptional, registry });
  }

  return coreInject({ key: opts.key, isOptional: opts.isOptional, registry });
};

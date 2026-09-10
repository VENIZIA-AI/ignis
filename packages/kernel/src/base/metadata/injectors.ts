import type { TBindingKey } from '@/helpers/inversion';
import { MetadataRegistry } from '@/helpers/inversion';
import type { AnyType, TClass } from '@venizia/ignis-helpers/common';
import { inject as coreInject } from '@venizia/ignis-inversion';

/** Either a binding key or the class bound under it - never both. */
export type TInjectOptions = { isOptional?: boolean } & (
  { key: TBindingKey; target?: never } | { target: TClass<AnyType>; key?: never }
);

export const inject = (opts: TInjectOptions) => {
  const registry = MetadataRegistry.getInstance();

  // Branched, not spread: spreading widens the union back into a shape declaring both members.
  if (opts.key === undefined) {
    return coreInject({ target: opts.target, isOptional: opts.isOptional, registry });
  }

  return coreInject({ key: opts.key, isOptional: opts.isOptional, registry });
};

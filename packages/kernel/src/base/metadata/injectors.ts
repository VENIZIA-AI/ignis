import type { TBindingKey } from '@/helpers/inversion';
import { MetadataRegistry } from '@/helpers/inversion';
import type { AnyType, TClass } from '@venizia/ignis-helpers/common';
import { inject as coreInject } from '@venizia/ignis-inversion';

/**
 * Marks a property or constructor parameter for dependency injection - by binding key, or by the
 * class bound under it. Exactly one of the two: a call site cannot state two answers.
 */
export type TInjectOptions = { isOptional?: boolean } & (
  { key: TBindingKey; target?: never } | { target: TClass<AnyType>; key?: never }
);

export const inject = (opts: TInjectOptions) => {
  const registry = MetadataRegistry.getInstance();

  // Branched rather than spread: spreading a discriminated union widens it back into a shape that
  // declares both members, which is exactly what the union exists to forbid.
  if (opts.key === undefined) {
    return coreInject({ target: opts.target, isOptional: opts.isOptional, registry });
  }

  return coreInject({ key: opts.key, isOptional: opts.isOptional, registry });
};

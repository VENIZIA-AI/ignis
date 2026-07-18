import type { TBindingKey } from '@/helpers/inversion';
import { MetadataRegistry } from '@/helpers/inversion';
import { inject as coreInject } from '@venizia/ignis-inversion';

/** Marks a property or constructor parameter for dependency injection. */
export const inject = (opts: { key: TBindingKey; isOptional?: boolean }) => {
  return coreInject({ ...opts, registry: MetadataRegistry.getInstance() });
};

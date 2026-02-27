import { IInjectableMetadata, MetadataRegistry } from '@/helpers/inversion';
import { inject as coreInject, injectable as coreInjectable } from '@venizia/ignis-inversion';

export const injectable = (metadata: IInjectableMetadata): ClassDecorator => {
  return coreInjectable(metadata, MetadataRegistry.getInstance());
};

/** Marks a property or constructor parameter for dependency injection. */
export const inject = (opts: { key: string | symbol; isOptional?: boolean }) => {
  return coreInject({ ...opts, registry: MetadataRegistry.getInstance() });
};

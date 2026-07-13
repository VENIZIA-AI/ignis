import { getError } from '@/common/app-error';
import { TBindingKey } from '@/common/types';
import { IInjectableMetadata } from '@/registry/common/types';
import { MetadataRegistry, metadataRegistry } from '@/registry';

export const injectable = (
  metadata: IInjectableMetadata,
  registry?: MetadataRegistry,
): ClassDecorator => {
  return target => {
    (registry ?? metadataRegistry).setInjectableMetadata({ target, metadata });
  };
};

/** Marks a property or constructor parameter for dependency injection. */
export const inject = (opts: {
  key: TBindingKey;
  isOptional?: boolean;
  registry?: MetadataRegistry;
}) => {
  return (target: any, propertyName: string | symbol | undefined, parameterIndex?: number) => {
    const registry = opts.registry ?? metadataRegistry;

    if (typeof parameterIndex === 'number') {
      registry.setInjectMetadata({
        target,
        index: parameterIndex,
        metadata: {
          key: opts.key,
          index: parameterIndex,
          isOptional: opts.isOptional ?? false,
        },
      });
      return;
    }

    if (propertyName !== undefined) {
      registry.setPropertyMetadata({
        target,
        propertyName: propertyName,
        metadata: {
          bindingKey: opts.key,
          isOptional: opts.isOptional ?? false,
        },
      });
      return;
    }

    throw getError({
      message: '@inject decorator can only be used on class properties or constructor parameters',
    });
  };
};

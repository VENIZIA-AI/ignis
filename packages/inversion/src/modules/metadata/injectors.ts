import { getError } from '@/modules/error';
import { isClass } from '@/common/utilities';
import { AnyType, TBindingKey, TClass } from '@/common/types';
import { MetadataRegistry, metadataRegistry } from '@/modules/registry';

/**
 * Either a binding key or the class bound under it - never both, so a call site cannot state two
 * answers and leave the container to pick one.
 */
export type TInjectOptions = {
  isOptional?: boolean;
  registry?: MetadataRegistry;
} & ({ key: TBindingKey; target?: never } | { target: TClass<AnyType>; key?: never });

/** Marks a property or constructor parameter for dependency injection. */
export const inject = (opts: TInjectOptions) => {
  const { key, target: injected } = opts;

  // A circular import leaves `target` undefined; without this the metadata records a hole that only
  // surfaces at resolve time, far from the import that caused it.
  if (key === undefined && !isClass(injected)) {
    throw getError({
      message: `@inject was given no binding key and no class | target: ${String(injected)}`,
    });
  }

  return (target: any, propertyName: string | symbol | undefined, parameterIndex?: number) => {
    const registry = opts.registry ?? metadataRegistry;

    if (typeof parameterIndex === 'number') {
      registry.setInjectMetadata({
        target,
        index: parameterIndex,
        metadata: {
          ...(key === undefined ? { target: injected } : { key }),
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
          ...(key === undefined ? { target: injected } : { bindingKey: key }),
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

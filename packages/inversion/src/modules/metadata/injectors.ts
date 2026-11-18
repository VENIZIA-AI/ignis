import { getError } from '@/modules/error';
import { type TBindingKey, type TInjectTarget } from '@/common/types';
import { type MetadataRegistry, metadataRegistry } from '@/modules/registry';

/** Either a key, or the class bound under it - never both. The class may be named directly or through a function, which defers the reference past an import cycle. */
export type TInjectOptions = {
  isOptional?: boolean;
  registry?: MetadataRegistry;
} & ({ key: TBindingKey; target?: never } | { target: TInjectTarget; key?: never });

/**
 * Marks a property or constructor parameter for dependency injection.
 *
 * `key` takes a typed key, but the decorated parameter or property is NOT checked against its type: a parameter
 * decorator is handed no parameter type, and a property check would reject every `protected` or `private` field. Annotate
 * from the key so the two cannot drift: `options: TBindingKeyValue<typeof Keys.OPTIONS>`.
 */
export const inject = (opts: TInjectOptions) => {
  const { key, target: injected } = opts;

  // A circular import leaves `target` undefined; fail here, not at resolve time. A function is the
  // deferred form - what it returns is checked when the container resolves it.
  if (key === undefined && typeof injected !== 'function') {
    throw getError({
      message: `@inject was given no binding key and no class | target: ${String(injected)}`,
    });
  }

  return (target: object, propertyName: string | symbol | undefined, parameterIndex?: number) => {
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

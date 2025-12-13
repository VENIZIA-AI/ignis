import { getError } from '@/common/app-error';
import { IInjectableMetadata } from '@/common/types';
import { MetadataRegistry, metadataRegistry } from '@/registry';

export const injectable = (
  metadata: IInjectableMetadata,
  registry?: MetadataRegistry,
): ClassDecorator => {
  return target => {
    (registry ?? metadataRegistry).setInjectableMetadata({ target, metadata });
  };
};

/**
 * @inject decorator - Marks a property or constructor parameter for dependency injection
 *
 * Usage examples:
 *
 * 1. Property injection:
 * ```typescript
 * class UserService {
 *   @inject({ key: 'UserRepository' })
 *   userRepository: UserRepository;
 * }
 * ```
 *
 * 2. Constructor parameter injection:
 * ```typescript
 * class UserService {
 *   constructor(
 *     @inject({ key: 'UserRepository' })
 *     private userRepository: UserRepository,
 *
 *     @inject({ key: 'Logger', optional: true })
 *     private logger?: Logger
 *   ) {}
 * }
 * ```
 *
 * @param opts - Injection options
 * @param opts.key - The binding key to inject (can be string or symbol)
 * @param opts.optional - Whether the dependency is optional (defaults to false)
 */
export const inject = (opts: {
  key: string | symbol;
  isOptional?: boolean;
  registry?: MetadataRegistry;
}) => {
  return (target: any, propertyName: string | symbol | undefined, parameterIndex?: number) => {
    const registry = opts.registry ?? metadataRegistry;

    // Constructor parameter injection
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

    // Property injection
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

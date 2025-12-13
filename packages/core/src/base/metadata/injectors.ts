import { IInjectableMetadata, MetadataRegistry } from '@venizia/ignis-helpers';
import { inject as coreInject, injectable as coreInjectable } from '@venizia/ignis-inversion';

export const injectable = (metadata: IInjectableMetadata): ClassDecorator => {
  return coreInjectable(metadata, MetadataRegistry.getInstance());
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
export const inject = (opts: { key: string | symbol; isOptional?: boolean }) => {
  return coreInject({ ...opts, registry: MetadataRegistry.getInstance() });
};

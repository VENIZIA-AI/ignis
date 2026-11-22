import { getError } from '../error';
import { type TClass } from '@/common/types';
import { BaseContainer } from './base';

/** Default container: constructor + property injection driven by the decorator metadata registry. */
export class Container extends BaseContainer {
  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
  }

  override instantiate<T>(cls: TClass<T>): T {
    const registry = this.getMetadataRegistry();

    const injectMetadata = registry.getInjectMetadata({
      target: cls,
    });

    const args: unknown[] = [];

    for (let index = 0; index < (injectMetadata?.length ?? 0); index++) {
      const meta = injectMetadata?.[index];

      if (!meta) {
        throw getError({
          message: `[${cls.name}] Constructor parameter ${index} has no @inject | Every parameter of a container-instantiated class must be decorated - the container cannot supply an undecorated one`,
        });
      }

      const isOptional = meta.isOptional ?? false;
      const key = this.resolveBindingKey({
        key: meta.key,
        target: meta.target,
        isOptional,
        owner: cls.name,
        at: `Constructor parameter ${index}`,
      });

      args[meta.index] = key === undefined ? undefined : this.get({ key, isOptional });
    }

    // `TClass` takes `never[]`, so any constructor fits; Reflect.construct is how the arguments reach it.
    const instance: T = Reflect.construct(cls, args);

    // A constructor always answers an object (or a function); the guard narrows `T` to something `Reflect.set` takes.
    if ((typeof instance !== 'object' && typeof instance !== 'function') || instance === null) {
      return instance;
    }

    const propertyMetadata = registry.getPropertiesMetadata({
      target: instance,
    });

    if (!propertyMetadata?.size) {
      return instance;
    }

    const properties = propertyMetadata.entries();

    for (const [propertyKey, metadata] of properties) {
      const isOptional = metadata.isOptional ?? false;
      const key = this.resolveBindingKey({
        key: metadata.bindingKey,
        target: metadata.target,
        isOptional,
        owner: cls.name,
        at: `Property '${String(propertyKey)}'`,
      });

      const assigned = Reflect.set(
        instance,
        propertyKey,
        key === undefined ? undefined : this.get({ key, isOptional }),
      );

      // Assigning to a read-only property threw; Reflect.set only answers false, so keep the throw.
      if (!assigned) {
        throw getError({
          message: `[${cls.name}] Property '${String(propertyKey)}' cannot be injected | It is read-only`,
        });
      }
    }

    return instance;
  }
}

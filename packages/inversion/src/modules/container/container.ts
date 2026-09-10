import { getError } from '../error';
import { AnyType, TBindingKey, TClass } from '@/common/types';
import { BaseContainer } from './base';

/** Default container: constructor + property injection driven by the decorator metadata registry. */
export class Container extends BaseContainer {
  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
  }

  /** The class form reads the key the REGISTRATION recorded, so a call-site override and an imperative `application.service(X)` both resolve. */
  protected resolveBindingKey(opts: {
    key?: TBindingKey;
    target?: TClass<AnyType>;
    cls: TClass<AnyType>;
    at: string;
  }): TBindingKey {
    const { key, target, cls, at } = opts;

    if (key !== undefined) {
      return key;
    }

    if (target === undefined) {
      throw getError({
        message: `[${cls.name}] ${at} has neither an @inject key nor a class`,
      });
    }

    const recorded = this.getMetadataRegistry().getBindingKey({ target });
    if (recorded === undefined) {
      throw getError({
        message: `[${cls.name}] ${at} names '${target.name}', which is not registered as an artifact | Decorate it (@service, @repository, ...) or register it on the application before it is injected`,
      });
    }

    return recorded;
  }

  override instantiate<T>(cls: TClass<T>): T {
    const registry = this.getMetadataRegistry();

    const injectMetadata = registry.getInjectMetadata({
      target: cls,
    });

    const args: any[] = [];

    for (let index = 0; index < (injectMetadata?.length ?? 0); index++) {
      const meta = injectMetadata?.[index];

      if (!meta) {
        throw getError({
          message: `[${cls.name}] Constructor parameter ${index} has no @inject | Every parameter of a container-instantiated class must be decorated - the container cannot supply an undecorated one`,
        });
      }

      const key = this.resolveBindingKey({
        key: meta.key,
        target: meta.target,
        cls,
        at: `Constructor parameter ${index}`,
      });

      args[meta.index] = this.get({ key, isOptional: meta.isOptional ?? false });
    }

    const instance = new cls(...args);

    const propertyMetadata = registry.getPropertiesMetadata({
      target: instance as object,
    });

    if (!propertyMetadata?.size) {
      return instance;
    }

    const properties = propertyMetadata.entries();
    for (const [propertyKey, metadata] of properties) {
      const key = this.resolveBindingKey({
        key: metadata.bindingKey,
        target: metadata.target,
        cls,
        at: `Property '${String(propertyKey)}'`,
      });

      const dep = this.get({
        key,
        isOptional: metadata.isOptional ?? false,
      });
      (instance as any)[propertyKey] = dep;
    }

    return instance;
  }
}

import { getError } from '../error';
import { AnyType, TBindingKey, TClass, TInjectTarget } from '@/common/types';
import { resolveInjectTarget } from '@/common/utilities';
import { BaseContainer } from './base';

/** Default container: constructor + property injection driven by the decorator metadata registry. */
export class Container extends BaseContainer {
  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
  }

  /**
   * The class form reads the key the REGISTRATION recorded, so a call-site override and an imperative
   * `application.service(X)` both resolve. `@inject` takes a key or a class; metadata a framework
   * writes may carry both, and then the class wins and the key is the fallback for a class nothing
   * recorded - one bound by hand with `bind({ key }).toClass(X)`. An optional class with neither
   * resolves to `undefined`, as an optional key would.
   */
  protected resolveBindingKey(opts: {
    key?: TBindingKey;
    target?: TInjectTarget;
    isOptional?: boolean;
    cls: TClass<AnyType>;
    at: string;
  }): TBindingKey | undefined {
    const { key, target: declared, isOptional = false, cls, at } = opts;

    if (declared === undefined && key !== undefined) {
      return key;
    }

    if (declared === undefined) {
      throw getError({
        message: `[${cls.name}] ${at} has neither an @inject key nor a class`,
      });
    }

    const target = resolveInjectTarget({ target: declared });
    if (target === undefined) {
      throw getError({
        message: `[${cls.name}] ${at} names a function that did not return a class`,
      });
    }

    const recorded = this.getMetadataRegistry().getBindingKey({ target }) ?? key;
    if (recorded === undefined && isOptional) {
      return undefined;
    }

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

      const isOptional = meta.isOptional ?? false;
      const key = this.resolveBindingKey({
        key: meta.key,
        target: meta.target,
        isOptional,
        cls,
        at: `Constructor parameter ${index}`,
      });

      args[meta.index] = key === undefined ? undefined : this.get({ key, isOptional });
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
      const isOptional = metadata.isOptional ?? false;
      const key = this.resolveBindingKey({
        key: metadata.bindingKey,
        target: metadata.target,
        isOptional,
        cls,
        at: `Property '${String(propertyKey)}'`,
      });

      (instance as any)[propertyKey] =
        key === undefined ? undefined : this.get({ key, isOptional });
    }

    return instance;
  }
}

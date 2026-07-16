import { getError } from '../error';
import { TClass } from '@/common/types';
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

    const args: any[] = [];

    for (let index = 0; index < (injectMetadata?.length ?? 0); index++) {
      const meta = injectMetadata?.[index];

      if (!meta) {
        throw getError({
          message: `[${cls.name}] Constructor parameter ${index} has no @inject | Every parameter of a container-instantiated class must be decorated - the container cannot supply an undecorated one`,
        });
      }

      args[meta.index] = this.get({ key: meta.key, isOptional: meta.isOptional ?? false });
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
      const dep = this.get({
        key: metadata.bindingKey,
        isOptional: metadata.optional ?? false,
      });
      (instance as any)[propertyKey] = dep;
    }

    return instance;
  }
}

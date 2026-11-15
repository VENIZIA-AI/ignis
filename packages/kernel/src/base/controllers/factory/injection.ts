import { MetadataRegistry } from '@/helpers/inversion';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { TClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/** What an options object declares: a name for each class its callbacks need. Classes only: a key or an optional dependency is not declared here. */
export type TInjectMap = Record<string, TClass<object>>;

/** What each callback receives: the same names, holding the instances the container resolved. */
export type TInjected<Inject extends TInjectMap> = {
  [Name in keyof Inject]: InstanceType<Inject[Name]>;
};

/**
 * Dependencies of a factory's callbacks. A factory takes `inject: { products: ProductRepository }`, records each class
 * as a constructor parameter of the controller it generates, and hands the resolved instances to every callback as
 * `injected`. The container resolves them once, when it builds the controller at boot, so a class that is not
 * registered fails the boot and not a request. A callback never looks anything up in the container.
 */
export class Injection {
  /**
   * Records each declared class as constructor parameter `offset + n` of `target`: the metadata `@inject({ target })`
   * writes, and the kind `CrudControllerFactory.registerRepositoryInjection` writes for parameter 0. Recorded as
   * metadata rather than a parameter decorator, which Bun drops in some configurations.
   */
  static register(opts: { target: TClass<unknown>; inject: TInjectMap; offset: number }): void {
    const { target, inject, offset } = opts;

    Object.values(inject).forEach((dependency, position) => {
      const index = offset + position;

      MetadataRegistry.getInstance().setInjectMetadata({
        target,
        index,
        metadata: { target: dependency, index, isOptional: false },
      });
    });
  }

  /** The one trust boundary: the container hands instances positionally and untyped; this checks that every name got one. */
  private static isComplete<Inject extends TInjectMap>(opts: {
    inject: Inject;
    injected: Record<string, unknown>;
  }): opts is { inject: Inject; injected: TInjected<Inject> } {
    return Object.keys(opts.inject).every((name) => {
      const instance = opts.injected[name];

      return typeof instance === 'object' && instance !== null;
    });
  }

  /**
   * Zips the declared names with the instances the container passed to the constructor, in declaration order. A subclass
   * with a constructor of its own must pass every argument on to `super`; one that does not is refused here, at boot.
   */
  static collect<Inject extends TInjectMap>(opts: {
    scope: string;
    inject: Inject;
    instances: unknown[];
  }): TInjected<Inject> {
    const { scope, inject, instances } = opts;
    const names = Object.keys(inject);
    const candidate = {
      inject,
      injected: Object.fromEntries(names.map((name, position) => [name, instances[position]])),
    };

    if (!Injection.isComplete(candidate)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] A declared dependency was not injected | inject: ${names.join(', ')} | a subclass constructor must pass every argument on to super`,
      });
    }

    return candidate.injected;
  }
}

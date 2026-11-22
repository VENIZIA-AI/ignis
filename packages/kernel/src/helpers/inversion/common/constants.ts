import { BindingNamespaces } from '@/common/bindings';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { TBindingScope } from '@venizia/ignis-inversion';
import type { IArtifactRegistrationOptions } from './types/artifact';
import { injectable } from '@/base/metadata/injectable';

/** What an application declares about an artifact type of its own: the binding namespace its classes get and the scope they bind with unless a class says otherwise. */
export interface IArtifactTypeDefinition {
  type: string;
  namespace: string;
  scope: TBindingScope;
}

/** What a decorated class is to the application - the one fact the artifact generator and the registration methods both read. The seven constants are the built-in types; an application adds its own with `define`. */
export class ArtifactTypes extends ConstClass {
  static readonly CONFIGURATION = 'configuration';
  static readonly COMPONENT = 'component';
  static readonly CONTROLLER = 'controller';
  static readonly SERVICE = 'service';
  static readonly REPOSITORY = 'repository';
  static readonly DATASOURCE = 'datasource';
  static readonly MODEL = 'model';

  /** The types an application declared. A true private field, so `values()` and `isValid` keep answering for the built-in types alone. */
  static readonly #defined = new Map<string, IArtifactTypeDefinition>();

  /**
   * Declares an artifact type of the application and returns its decorator: `@emitter()` registers the class like a
   * stereotype does, in `namespace`, bound with `scope`. Declaring the same type again with the same namespace and scope
   * (a module imported twice) changes nothing; with another one, it throws.
   *
   * @example
   * ```typescript
   * export const emitter = ArtifactTypes.define({
   *   type: 'emitter',
   *   namespace: 'emitters',
   *   scope: BindingScopes.SINGLETON,
   * });
   *
   * export @emitter()
   * class OrderEmitter {}
   * ```
   */
  static define(opts: IArtifactTypeDefinition) {
    const { type, namespace, scope } = opts;

    if (typeof type !== 'string' || !/^[^\s]+$/.test(type)) {
      throw getError({
        message: `[ArtifactTypes][define] Invalid type | Expected a non-empty name without whitespace | Got: '${type}'`,
      });
    }

    if (ArtifactTypes.isValid(type)) {
      throw getError({
        message: `[ArtifactTypes][define] '${type}' is a built-in artifact type | Choose a name of your own`,
      });
    }

    BindingNamespaces.createNamespace({ name: namespace });

    if (BindingNamespaces.isBuiltIn({ name: namespace })) {
      throw getError({
        message: `[ArtifactTypes][define] '${namespace}' is the namespace of a built-in artifact type | type: '${type}' | Choose a namespace of your own`,
      });
    }

    const existing = ArtifactTypes.#defined.get(type);

    if (existing && (existing.namespace !== namespace || existing.scope !== scope)) {
      throw getError({
        message: `[ArtifactTypes][define] '${type}' is already defined with namespace '${existing.namespace}' and scope '${existing.scope}' | Got: namespace '${namespace}', scope '${scope}'`,
      });
    }

    if (!existing) {
      ArtifactTypes.#defined.set(type, { type, namespace, scope });
    }

    return <ApplicationType = unknown>(
      registration?: IArtifactRegistrationOptions<ApplicationType>,
    ): ClassDecorator => injectable<ApplicationType>({ type, ...registration });
  }

  /** The names of the types `define` recorded, in the order they were defined. */
  static definedTypes(): string[] {
    return [...ArtifactTypes.#defined.keys()];
  }

  /** The definition `define` recorded for `type`; `undefined` for a built-in type and for a name nobody defined. */
  static definitionOf(opts: { type: string }): IArtifactTypeDefinition | undefined {
    return ArtifactTypes.#defined.get(opts.type);
  }
}

/** The `format` of `getAuthorizeModelPrincipals` and `getAuthorizeModelSettings`: ARRAY or RECORD. */
export class AuthorizeModelFormats extends ConstClass {
  static readonly ARRAY = 'array';
  static readonly RECORD = 'record';
}

/** Valid authorize model format values. */
export type TAuthorizeModelFormat = TConstValue<typeof AuthorizeModelFormats>;

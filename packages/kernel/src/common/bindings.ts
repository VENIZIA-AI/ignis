import { ArtifactTypes, BindingKeys } from '@/helpers/inversion';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

export type TBindingNamespace = TConstValue<typeof BindingNamespaces>;

/** Static binding namespaces for dependency injection. */
export class BindingNamespaces {
  // Declared first: every constant below runs through createNamespace while this class initializes.
  private static readonly NAME_PATTERN = /^[^.\s]+$/;

  static readonly COMPONENT = BindingNamespaces.createNamespace({ name: 'components' });

  static readonly DATASOURCE = BindingNamespaces.createNamespace({ name: 'datasources' });
  static readonly REPOSITORY = BindingNamespaces.createNamespace({ name: 'repositories' });
  static readonly MODEL = BindingNamespaces.createNamespace({ name: 'models' });

  static readonly SERVICE = BindingNamespaces.createNamespace({ name: 'services' });
  static readonly MIDDLEWARE = BindingNamespaces.createNamespace({ name: 'middlewares' });
  static readonly PROVIDER = BindingNamespaces.createNamespace({ name: 'providers' });
  static readonly CONTROLLER = BindingNamespaces.createNamespace({ name: 'controllers' });

  static readonly CONFIGURATION = BindingNamespaces.createNamespace({ name: 'configurations' });

  /**
   * A namespace is the leading segment of a binding key, and a binding is tagged with that segment
   * alone - a name carrying '.' or whitespace yields a key no boot step can drain by tag.
   */
  static isValid(opts: { name: string }): boolean {
    const { name } = opts;
    return typeof name === 'string' && BindingNamespaces.NAME_PATTERN.test(name);
  }

  static createNamespace(opts: { name: string }) {
    const { name } = opts;

    if (!BindingNamespaces.isValid({ name })) {
      throw getError({
        message: `[BindingNamespaces][createNamespace] Invalid namespace | Expected a single non-empty segment without '.' or whitespace | Got: '${name}'`,
      });
    }

    return name;
  }

  /** A namespace-less key is untagged: no boot step drains it and `doVerify` never sees it. */
  static assertArtifactNamespace(opts: { namespace: string; artifact: string; caller: string }) {
    const { namespace, artifact, caller } = opts;

    if (BindingNamespaces.isValid({ name: namespace })) {
      return namespace;
    }

    throw getError({
      message: `[${caller}] '${artifact}' declares a binding with no usable namespace | namespace: '${namespace}' | A key with no leading namespace segment carries no tag, so no boot step drains it and 'bootChecks.binding.doVerify' never sees it`,
    });
  }
}

/** Artifact kind -> namespace. `registerArtifact` gets its namespace from the call site; `@injectable` has only the class. */
export class ArtifactNamespaces {
  private static readonly BY_TYPE: Record<string, TBindingNamespace> = {
    [ArtifactTypes.COMPONENT]: BindingNamespaces.COMPONENT,
    [ArtifactTypes.CONTROLLER]: BindingNamespaces.CONTROLLER,
    [ArtifactTypes.SERVICE]: BindingNamespaces.SERVICE,
    [ArtifactTypes.REPOSITORY]: BindingNamespaces.REPOSITORY,
    [ArtifactTypes.DATASOURCE]: BindingNamespaces.DATASOURCE,
    [ArtifactTypes.MODEL]: BindingNamespaces.MODEL,
  };

  static resolve(opts: { type: string }): TBindingNamespace {
    const namespace = ArtifactNamespaces.BY_TYPE[opts.type];

    if (namespace === undefined) {
      throw getError({
        message: `[ArtifactNamespaces][resolve] No namespace for artifact type | type: '${opts.type}' | known: ${Object.keys(ArtifactNamespaces.BY_TYPE).join(', ')}`,
      });
    }

    return namespace;
  }
}

/** Core binding keys for fundamental application components and configuration. */
export class CoreBindings extends BindingKeys {
  static readonly APPLICATION_INSTANCE = '@app/instance';
  static readonly APPLICATION_SERVER = '@app/server';
  static readonly APPLICATION_CONFIG = '@app/config';
  static readonly APPLICATION_PROJECT_ROOT = '@app/project_root';

  static readonly APPLICATION_ROOT_ROUTER = '@app/router/root';

  static readonly APPLICATION_ENVIRONMENTS = '@app/environments';
  static readonly APPLICATION_MIDDLEWARE_OPTIONS = '@app/middleware_options';
}

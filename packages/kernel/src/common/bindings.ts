import { BindingKeys } from '@/helpers/inversion';
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
  static createNamespace(opts: { name: string }) {
    const { name } = opts;

    if (typeof name !== 'string' || !BindingNamespaces.NAME_PATTERN.test(name)) {
      throw getError({
        message: `[BindingNamespaces][createNamespace] Invalid namespace | Expected a single non-empty segment without '.' or whitespace | Got: '${name}'`,
      });
    }

    return name;
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

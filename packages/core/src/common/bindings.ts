import { TConstValue } from '@venizia/ignis-helpers';
import { BindingKeys } from '@/helpers/inversion';

/**
 * Type alias for a binding namespace, derived from `BindingNamespaces` constant values.
 */
export type TBindingNamespace = TConstValue<typeof BindingNamespaces>;

/**
 * Defines a collection of static binding namespaces used for dependency injection.
 * Each namespace represents a category of application components or concerns.
 */
export class BindingNamespaces {
  static readonly COMPONENT = BindingNamespaces.createNamespace({ name: 'components' });
  static readonly DATASOURCE = BindingNamespaces.createNamespace({ name: 'datasources' });
  static readonly REPOSITORY = BindingNamespaces.createNamespace({ name: 'repositories' });
  static readonly MODEL = BindingNamespaces.createNamespace({ name: 'models' });
  static readonly SERVICE = BindingNamespaces.createNamespace({ name: 'services' });
  static readonly MIDDLEWARE = BindingNamespaces.createNamespace({ name: 'middlewares' });
  static readonly PROVIDER = BindingNamespaces.createNamespace({ name: 'providers' });
  static readonly CONTROLLER = BindingNamespaces.createNamespace({ name: 'controllers' });
  static readonly BOOTERS = BindingNamespaces.createNamespace({ name: 'booters' });

  /**
   * Creates a new namespace string.
   * @param opts - Options for creating the namespace.
   * @param opts.name - The name of the namespace.
   * @returns The created namespace string.
   */
  static createNamespace(opts: { name: string }) {
    return opts.name;
  }
}

/**
 * Defines core binding keys used for dependency injection within the application.
 * These keys represent fundamental application components, configurations, and resources.
 */
export class CoreBindings extends BindingKeys {
  static readonly APPLICATION_INSTANCE = '@app/instance';
  static readonly APPLICATION_SERVER = '@app/server';
  static readonly APPLICATION_CONFIG = '@app/config';
  static readonly APPLICATION_PROJECT_ROOT = '@app/project_root';

  static readonly APPLICATION_ROOT_ROUTER = '@app/router/root';

  static readonly APPLICATION_ENVIRONMENTS = '@app/environments';
  static readonly APPLICATION_MIDDLEWARE_OPTIONS = '@app/middleware_options';
}

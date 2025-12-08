import { BindingKeys } from '@vez/ignis-helpers';

export class BindingNamespaces {
  static readonly COMPONENT = BindingNamespaces.createNamespace({ name: 'components' });
  static readonly DATASOURCE = BindingNamespaces.createNamespace({ name: 'datasources' });
  static readonly REPOSITORY = BindingNamespaces.createNamespace({ name: 'repositories' });
  static readonly MODEL = BindingNamespaces.createNamespace({ name: 'models' });
  static readonly SERVICE = BindingNamespaces.createNamespace({ name: 'services' });
  static readonly MIDDLEWARE = BindingNamespaces.createNamespace({ name: 'middlewares' });
  static readonly PROVIDER = BindingNamespaces.createNamespace({ name: 'providers' });
  static readonly CONTROLLER = BindingNamespaces.createNamespace({ name: 'controllers' });

  static createNamespace(opts: { name: string }) {
    return opts.name;
  }
}

export class CoreBindings extends BindingKeys {
  static readonly APPLICATION_INSTANCE = '@app/instance';
  static readonly APPLICATION_SERVER = '@app/server';
  static readonly APPLICATION_CONFIG = '@app/config';

  static readonly APPLICATION_ROOT_ROUTER = '@app/router/root';

  static readonly APPLICATION_ENVIRONMENTS = Symbol.for('@app/environments');
  static readonly APPLICATION_MIDDLEWARE_OPTIONS = Symbol.for('@app/middleware_options');
}

import { getError } from '@/helpers/error';
import isEmpty from 'lodash/isEmpty';

export class BindingNamespaces {
  static readonly COMPONENT = 'components';

  static readonly DATASOURCE = 'datasources';
  static readonly REPOSITORY = 'repositories';
  static readonly SERVICE = 'services';
  static readonly CONTROLLER = 'controllers';

  static createNamespace(opts: { name: string }) {
    return opts.name;
  }
}

export class BindingKeys {
  static readonly APPLICATION_INSTANCE = '@app/instance';
  static readonly APPLICATION_SERVER = '@app/server';
  static readonly APPLICATION_CONFIG = '@app/config';

  static readonly APPLICATION_ROOT_ROUTER = '@app/router/root';

  static readonly APPLICATION_ENVIRONMENTS = Symbol.for('@app/environments');
  static readonly APPLICATION_MIDDLEWARE_OPTIONS = Symbol.for('@app/middleware_options');

  // Security
  // static readonly AUTHENTICATION_STRATEGY = Symbol.for('@app/auth/strategy');
  // static readonly CURRENT_USER = Symbol.for('@app/auth/current-user');
  // static readonly TOKEN_SERVICE = Symbol.for('@app/auth/token-service');
  // static readonly USER_SERVICE = Symbol.for('@app/auth/user-service');

  // Request Context
  // static readonly REQUEST_CONTEXT = Symbol.for('@app/request/context');
  // static readonly HTTP_REQUEST = Symbol.for('@app/http/request');
  // static readonly HTTP_RESPONSE = Symbol.for('@app/http/response');

  static build(opts: { namespace: string; key: string }) {
    const { namespace, key } = opts;
    const keyParts: Array<string> = [];
    if (!isEmpty(namespace)) {
      keyParts.push(namespace);
    }

    if (isEmpty(key)) {
      throw getError({
        message: `[BindingKeys][build] Invalid key to build | key: ${key}`,
      });
    }

    keyParts.push(key);
    return keyParts.join('.');
  }
}

export class SecurityBindings {
  static readonly USER = Symbol.for('@security/user');
}

export class CoreBindings {
  static readonly APPLICATION_INSTANCE = BindingKeys.APPLICATION_INSTANCE;
  static readonly APPLICATION_SERVER = BindingKeys.APPLICATION_SERVER;
  static readonly APPLICATION_CONFIG = BindingKeys.APPLICATION_CONFIG;

  static readonly APPLICATION_ROOT_ROUTER = BindingKeys.APPLICATION_ROOT_ROUTER;
}

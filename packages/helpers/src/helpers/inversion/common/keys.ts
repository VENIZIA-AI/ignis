import { getError } from '@/helpers/error';
import isEmpty from 'lodash/isEmpty';

export const MetadataKeys = {
  // Controller metadata
  CONTROLLER: Symbol.for('ignis:controller'),
  CONTROLLER_ROUTE: Symbol.for('ignis:controller:route'),

  // Property metadata
  PROPERTIES: Symbol.for('ignis:properties'),

  // Route metadata
  // ROUTE: Symbol.for('ignis:route'),
  // ROUTES: Symbol.for('ignis:routes'),

  // Parameter metadata
  // PARAMETER: Symbol.for('ignis:parameter'),
  // PARAMETERS: Symbol.for('ignis:parameters'),

  // Model metadata
  MODEL: Symbol.for('ignis:model'),
  DATASOURCE: Symbol.for('ignis:datasource'),
  REPOSITORY: Symbol.for('ignis:repository'),

  // Injection metadata
  INJECT: Symbol.for('ignis:inject'),
  INJECTABLE: Symbol.for('ignis:injectable'),

  // Middleware/Interceptor metadata
  // MIDDLEWARE: Symbol.for('ignis:middleware'),
  // INTERCEPTOR: Symbol.for('ignis:interceptor'),

  // Authentication/Authorization
  // AUTHENTICATE: Symbol.for('ignis:authenticate'),
  // AUTHORIZE: Symbol.for('ignis:authorize'),
};

export class BindingKeys {
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

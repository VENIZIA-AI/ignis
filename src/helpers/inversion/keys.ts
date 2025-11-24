export const MetadataKeys = {
  // Controller metadata
  CONTROLLER: Symbol.for('ignis:controller'),
  CONTROLLER_BASEPATH: Symbol.for('ignis:controller:basepath'),

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

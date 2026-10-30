import type { INamespaceMapping } from '../mapping';

/** Where the kernel names are importable: its root, and `@venizia/ignis`, which re-exports the whole kernel root. */
const ROOT = ['@venizia/ignis-kernel', '@venizia/ignis'];
/** The same, for a name the lean `./metadata` entry carries as well. */
const WITH_METADATA = ['@venizia/ignis-kernel', '@venizia/ignis-kernel/metadata', '@venizia/ignis'];
/** The same, for a name the lean `./repository` entry carries as well. */
const WITH_REPOSITORY = [
  '@venizia/ignis-kernel',
  '@venizia/ignis-kernel/repository',
  '@venizia/ignis',
];

/**
 * The functions of `@venizia/ignis-kernel` that moved into a class.
 *
 * `keepsOptions` marks a function that already took ONE options object (or, for
 * `conditionalCountResponse`, one positional value the method still takes as it is): the class
 * method takes the same argument, so a call keeps its arguments and only the callee changes. Only
 * `asTypedContext` and `snakeToCamel` became an options object, and carry their key.
 *
 * Left as functions on purpose, so not listed: the decorators (`injectable`, `service`, `component`,
 * `configuration`, `provide`, `inject`, `model`, `datasource`, `repository`, `controller`, `api`,
 * `get`, `post`, `put`, `patch`, `del`, `rpc`, `unary`, `serverStream`, `clientStream`,
 * `bidiStream`), the middleware DSL (`authenticate`, `authorize`, `notFoundHandler`), the type
 * guard `isDataSourceClass`, and `getDroppedRouteDecorators`, whose class is not exported.
 */
export const KERNEL_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  {
    modules: ROOT,
    oldName: 'htmlContent',
    className: 'OpenApiResponses',
    method: 'htmlContent',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'htmlResponse',
    className: 'OpenApiResponses',
    method: 'htmlResponse',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'jsonContent',
    className: 'OpenApiResponses',
    method: 'jsonContent',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'errorResponses',
    className: 'OpenApiResponses',
    method: 'errorResponses',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'jsonResponse',
    className: 'OpenApiResponses',
    method: 'jsonResponse',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'requiredString',
    className: 'OpenApiSchemas',
    method: 'requiredString',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'idParamsSchema',
    className: 'OpenApiSchemas',
    method: 'idParams',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'asTypedContext',
    className: 'ContextUtility',
    method: 'asTypedContext',
    params: [{ key: 'context' }],
  },
  {
    modules: ROOT,
    oldName: 'registerFactoryRepositoryInjection',
    className: 'ControllerFactory',
    method: 'registerRepositoryInjection',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'toContentRange',
    className: 'DataRangeUtility',
    method: 'toContentRange',
    params: [],
    keepsOptions: true,
  },
  {
    modules: WITH_REPOSITORY,
    oldName: 'buildDataRange',
    className: 'DataRangeUtility',
    method: 'buildDataRange',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'toEntityId',
    className: 'ModelUtility',
    method: 'toEntityId',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'snakeToCamel',
    className: 'ModelUtility',
    method: 'snakeToCamel',
    params: [{ key: 'shape' }],
  },
  {
    modules: ROOT,
    oldName: 'readDeclarative',
    className: 'RequestDomainResolver',
    method: 'readDeclarative',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'resolveRequestDomain',
    className: 'RequestDomainResolver',
    method: 'resolveRequestDomain',
    params: [],
    keepsOptions: true,
  },
  {
    modules: WITH_METADATA,
    oldName: 'pickRegistrationOptions',
    className: 'InjectableUtility',
    method: 'pickRegistrationOptions',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'emojiFavicon',
    className: 'EmojiFaviconMiddleware',
    method: 'create',
    params: [],
    keepsOptions: true,
  },
  {
    modules: WITH_REPOSITORY,
    oldName: 'throwNotSupported',
    className: 'ErrorUtility',
    method: 'throwNotSupported',
    params: [],
    keepsOptions: true,
  },
  // Delegates: the class was already there and the old name already forwarded to it.
  {
    modules: ROOT,
    oldName: 'conditionalCountResponse',
    className: 'RouteConfigResolver',
    method: 'conditionalCountResponse',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'resolveCountConfig',
    className: 'RouteConfigResolver',
    method: 'resolveCountConfig',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'resolveFindConfig',
    className: 'RouteConfigResolver',
    method: 'resolveFindConfig',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'resolveFindByIdConfig',
    className: 'RouteConfigResolver',
    method: 'resolveFindByIdConfig',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'resolveFindOneConfig',
    className: 'RouteConfigResolver',
    method: 'resolveFindOneConfig',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'resolveCreateConfig',
    className: 'RouteConfigResolver',
    method: 'resolveCreateConfig',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ROOT,
    oldName: 'defineControllerRouteConfigs',
    className: 'RouteConfigResolver',
    method: 'defineControllerRouteConfigs',
    params: [],
    keepsOptions: true,
  },
];

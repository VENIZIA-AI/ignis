import type { INamespaceMapping } from '../mapping';

const ROOT = '@venizia/ignis-helpers';
const CORE = '@venizia/ignis-helpers/core';
const COMMON = '@venizia/ignis-helpers/common';
const UUID = '@venizia/ignis-helpers/uuid';
const PINO = '@venizia/ignis-helpers/pino';
const WINSTON = '@venizia/ignis-helpers/winston';
const KAFKA = '@venizia/ignis-helpers/kafka';

/**
 * The functions of `@venizia/ignis-helpers` that moved into a class. `modules` lists the entries the
 * old name is importable from, not the ones that only carry the class: `core.ts` names the pure
 * subset by hand, `./common` and `./uuid` are folders. `keepsOptions` marks a function that already
 * took one options object, which its method takes unchanged.
 *
 * The inversion names the package re-exports (`isEmpty`, `omit`, `resolveValue`, ...) are in the
 * inversion table, which lists the helpers entries in its own `modules`.
 *
 * Not here, and still functions: `isPromiseLike`, `isRedisHelper` (type guards), and
 * `applicationLogFormatter` (a value, not a function). `ApplicationLogger.get` stays callable as
 * `get(scope)`, a call the codemod does not follow because the name is the class itself.
 */
export const HELPERS_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  // utilities/performance.utility.ts
  {
    modules: [ROOT],
    oldName: 'getPerformanceCheckpoint',
    className: 'PerformanceUtility',
    method: 'getCheckpoint',
    params: [],
  },
  {
    modules: [ROOT],
    oldName: 'getExecutedPerformance',
    className: 'PerformanceUtility',
    method: 'getExecuted',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT, CORE],
    oldName: 'executeWithPerformanceMeasure',
    className: 'PerformanceUtility',
    method: 'executeWithMeasure',
    params: [],
    keepsOptions: true,
  },

  // utilities/hr-time.utility.ts
  {
    modules: [ROOT],
    oldName: 'hrTime',
    className: 'HrTimeUtility',
    method: 'getSeconds',
    params: [],
  },

  // utilities/request.utility.ts
  {
    modules: [ROOT],
    oldName: 'parseMultipartBody',
    className: 'RequestUtility',
    method: 'parseMultipartBody',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'sanitizeFilename',
    className: 'RequestUtility',
    method: 'sanitizeFilename',
    params: [{ key: 'filename' }],
  },
  {
    modules: [ROOT],
    oldName: 'encodeRFC5987',
    className: 'RequestUtility',
    method: 'encodeRfc5987',
    params: [{ key: 'filename' }],
  },
  {
    modules: [ROOT],
    oldName: 'createContentDispositionHeader',
    className: 'RequestUtility',
    method: 'buildContentDispositionHeader',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'parseContentDisposition',
    className: 'RequestUtility',
    method: 'parseContentDisposition',
    params: [],
    keepsOptions: true,
  },

  // utilities/form-body.utility.ts
  {
    modules: [ROOT, CORE],
    oldName: 'readFormBody',
    className: 'FormBodyUtility',
    method: 'readFormBody',
    params: [],
    keepsOptions: true,
  },

  // utilities/parse.utility.ts
  {
    modules: [ROOT],
    oldName: 'getUID',
    className: 'ParseUtility',
    method: 'getUID',
    params: [],
  },
  {
    modules: [ROOT, CORE],
    oldName: 'toCamel',
    className: 'ParseUtility',
    method: 'toCamel',
    params: [{ key: 'input' }],
  },
  {
    modules: [ROOT, CORE],
    oldName: 'keysToCamel',
    className: 'ParseUtility',
    method: 'keysToCamel',
    params: [{ key: 'source' }],
  },
  {
    modules: [ROOT],
    oldName: 'isInt',
    className: 'ParseUtility',
    method: 'isInt',
    params: [{ key: 'input' }],
  },
  {
    modules: [ROOT],
    oldName: 'isFloat',
    className: 'ParseUtility',
    method: 'isFloat',
    params: [{ key: 'input' }],
  },
  {
    modules: [ROOT, CORE],
    oldName: 'int',
    className: 'ParseUtility',
    method: 'toInt',
    params: [{ key: 'input' }],
  },
  {
    modules: [ROOT],
    oldName: 'float',
    className: 'ParseUtility',
    method: 'toFloat',
    params: [{ key: 'input' }, { key: 'digit', optional: true }],
  },
  {
    modules: [ROOT, CORE],
    oldName: 'toBoolean',
    className: 'ParseUtility',
    method: 'toBoolean',
    params: [{ key: 'input' }],
  },
  {
    modules: [ROOT],
    oldName: 'parseArrayToMapWithKey',
    className: 'ParseUtility',
    method: 'parseArrayToMapWithKey',
    params: [{ key: 'items' }, { key: 'key' }],
  },
  {
    modules: [ROOT],
    oldName: 'toDelimitedArray',
    className: 'ParseUtility',
    method: 'toDelimitedArray',
    params: [{ key: 'input' }, { key: 'separator', optional: true }],
  },
  {
    modules: [ROOT, CORE],
    oldName: 'blankToUndefined',
    className: 'ParseUtility',
    method: 'blankToUndefined',
    params: [{ key: 'input' }],
  },
  {
    modules: [ROOT],
    oldName: 'toTrimmed',
    className: 'ParseUtility',
    method: 'toTrimmed',
    params: [{ key: 'input' }],
  },
  {
    modules: [ROOT],
    oldName: 'getDeepProperty',
    className: 'ParseUtility',
    method: 'getDeepProperty',
    params: [{ key: 'source' }, { key: 'path' }],
  },

  // utilities/sleep.utility.ts, utilities/promise.utility.ts
  {
    modules: [ROOT],
    oldName: 'sleep',
    className: 'PromiseUtility',
    method: 'sleep',
    params: [{ key: 'ms' }],
  },
  {
    modules: [ROOT],
    oldName: 'executePromiseWithLimit',
    className: 'PromiseUtility',
    method: 'executeWithLimit',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'voidExecution',
    className: 'PromiseUtility',
    method: 'voidExecution',
    params: [],
    keepsOptions: true,
  },

  // utilities/error.utility.ts
  {
    modules: [ROOT],
    oldName: 'toError',
    className: 'ErrorUtility',
    method: 'toError',
    params: [{ key: 'error' }],
  },

  // modules/storage/common
  {
    modules: [ROOT],
    oldName: 'isNotFoundError',
    className: 'StorageUtility',
    method: 'isNotFoundError',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'toExpirySeconds',
    className: 'StorageUtility',
    method: 'toExpirySeconds',
    params: [],
    keepsOptions: true,
  },

  // modules/uid/uuid
  {
    modules: [ROOT, CORE, UUID],
    oldName: 'createUuidV4',
    className: 'UuidV4Generator',
    method: 'create',
    params: [],
  },
  {
    modules: [ROOT, CORE, UUID],
    oldName: 'uuidV4',
    className: 'UuidV4Generator',
    method: 'generate',
    params: [],
  },
  {
    modules: [ROOT, CORE, UUID],
    oldName: 'createUuidV5',
    className: 'UuidV5Generator',
    method: 'create',
    params: [],
  },
  {
    modules: [ROOT, CORE, UUID],
    oldName: 'uuidV5',
    className: 'UuidV5Generator',
    method: 'generate',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT, CORE, UUID],
    oldName: 'createUuidV7',
    className: 'UuidV7Generator',
    method: 'create',
    params: [],
  },
  {
    modules: [ROOT, CORE, UUID],
    oldName: 'uuidV7',
    className: 'UuidV7Generator',
    method: 'generate',
    params: [],
  },

  // common/redact.ts, common/resolvers.ts
  {
    modules: [ROOT, COMMON],
    oldName: 'redactSecrets',
    className: 'RedactUtility',
    method: 'redactSecrets',
    params: [{ key: 'value' }, { key: 'seen', optional: true }, { key: 'depth', optional: true }],
  },
  {
    modules: [ROOT, COMMON],
    oldName: 'toJsonSafe',
    className: 'RedactUtility',
    method: 'toJsonSafe',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT, COMMON],
    oldName: 'redactUrlCredentials',
    className: 'RedactUtility',
    method: 'redactUrlCredentials',
    params: [{ key: 'url' }],
  },
  {
    modules: [ROOT, COMMON],
    oldName: 'resolveClass',
    className: 'ClassResolver',
    method: 'resolveClass',
    params: [],
    keepsOptions: true,
  },

  // modules/redis, modules/secrets
  {
    modules: [ROOT],
    oldName: 'createRedisHelper',
    className: 'RedisHelperFactory',
    method: 'create',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'createSecretsHelper',
    className: 'SecretsHelperFactory',
    method: 'create',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'waitForRedisReady',
    className: 'RedisUtility',
    method: 'waitForReady',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'ensureRedisClientsConnecting',
    className: 'RedisUtility',
    method: 'ensureConnecting',
    params: [],
    keepsOptions: true,
  },

  // modules/network/utilities
  {
    modules: [ROOT, CORE],
    oldName: 'isUrlRefusedError',
    className: 'UrlPolicy',
    method: 'isRefusedError',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT, CORE],
    oldName: 'toQueryString',
    className: 'QueryStringUtility',
    method: 'toQueryString',
    params: [],
    keepsOptions: true,
  },

  // modules/queue/common/hook.ts
  {
    modules: [ROOT],
    oldName: 'invokeHook',
    className: 'HookUtility',
    method: 'invoke',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'awaitHook',
    className: 'HookUtility',
    method: 'execute',
    params: [],
    keepsOptions: true,
  },

  // modules/logger
  {
    modules: [ROOT],
    oldName: 'resolveLoggerLevel',
    className: 'LoggerConfigUtility',
    method: 'resolveLevel',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'resolveLoggerColorize',
    className: 'LoggerConfigUtility',
    method: 'resolveColorize',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [ROOT],
    oldName: 'formatLogMessage',
    className: 'LogFormatUtility',
    method: 'formatMessage',
    params: [],
    keepsOptions: true,
  },

  // modules/logger/pino
  {
    modules: [PINO],
    oldName: 'buildPinoOptions',
    className: 'PinoBackingLogger',
    method: 'buildOptions',
    params: [],
  },
  {
    modules: [PINO],
    oldName: 'getPinoBackingLogger',
    className: 'PinoBackingLogger',
    method: 'get',
    params: [],
  },
  {
    modules: [PINO],
    oldName: 'setPinoBackingLogger',
    className: 'PinoBackingLogger',
    method: 'set',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [PINO],
    oldName: 'mapFrequency',
    className: 'PinoDestination',
    method: 'mapFrequency',
    params: [{ key: 'value', optional: true }],
  },
  {
    modules: [PINO],
    oldName: 'mapMaxFilesToCount',
    className: 'PinoDestination',
    method: 'mapMaxFilesToCount',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [PINO],
    oldName: 'resolveDestinationPlan',
    className: 'PinoDestination',
    method: 'resolvePlan',
    params: [],
  },
  {
    modules: [PINO],
    oldName: 'buildDestination',
    className: 'PinoDestination',
    method: 'build',
    params: [{ key: 'plan' }],
  },

  // modules/logger/winston
  {
    modules: [WINSTON],
    oldName: 'defineCustomLogger',
    className: 'WinstonLoggerFactory',
    method: 'defineCustomLogger',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [WINSTON],
    oldName: 'defineJsonLoggerFormatter',
    className: 'WinstonFormatFactory',
    method: 'json',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [WINSTON],
    oldName: 'defineLogFormatter',
    className: 'WinstonFormatFactory',
    method: 'log',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [WINSTON],
    oldName: 'definePrettyLoggerFormatter',
    className: 'WinstonFormatFactory',
    method: 'pretty',
    params: [],
    keepsOptions: true,
  },
  {
    modules: [WINSTON],
    oldName: 'resolveDefaultTransportOptions',
    className: 'WinstonLoggerFactory',
    method: 'resolveDefaultTransportOptions',
    params: [],
  },
  {
    modules: [WINSTON],
    oldName: 'deepSplat',
    className: 'WinstonFormatFactory',
    method: 'deepSplat',
    params: [],
  },

  // modules/queue/kafka/bundler
  {
    modules: [KAFKA],
    oldName: 'platformaticRequirePlugin',
    className: 'PlatformaticKafkaPlugins',
    method: 'buildRequirePlugin',
    params: [],
  },
  {
    modules: [KAFKA],
    oldName: 'platformaticWasmPlugin',
    className: 'PlatformaticKafkaPlugins',
    method: 'buildWasmPlugin',
    params: [],
  },
  {
    modules: [KAFKA],
    oldName: 'platformaticKafkaPlugins',
    className: 'PlatformaticKafkaPlugins',
    method: 'build',
    params: [],
  },
];

import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { StoragePresignDefaults } from '@/modules/storage/common';
import { SecretProviders } from '@/modules/secrets/common';
import { PACKAGE_ROOT } from './package-root';

/**
 * The deprecated aliases of `@venizia/ignis-helpers` and the class methods that replace them: every
 * entry of the codemod table names an export that exists, and the old call and the new call built
 * from the entry's `params` answer the same.
 */
const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');
const MAPPING_SOURCE = path.resolve(
  REPOSITORY_ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/helpers.ts',
);

interface IMappingEntry {
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  newModules?: string[];
  params: Array<{ key: string; optional?: boolean }>;
  keepsOptions?: boolean;
}

const { HELPERS_MAPPINGS } = (await import(MAPPING_SOURCE)) as {
  HELPERS_MAPPINGS: ReadonlyArray<IMappingEntry>;
};

/** The module specifier of each entry the table names, mapped to the source file behind it. */
const SOURCES: Record<string, string> = {
  '@venizia/ignis-helpers': 'src/index.ts',
  '@venizia/ignis-helpers/core': 'src/core.ts',
  '@venizia/ignis-helpers/common': 'src/common/index.ts',
  '@venizia/ignis-helpers/uuid': 'src/uuid.ts',
  '@venizia/ignis-helpers/pino': 'src/modules/logger/pino/index.ts',
  '@venizia/ignis-helpers/winston': 'src/modules/logger/winston/index.ts',
  '@venizia/ignis-helpers/kafka': 'src/modules/queue/kafka/index.ts',
};

const loadModule = async (specifier: string): Promise<Record<string, unknown>> => {
  const source = SOURCES[specifier];
  if (!source) {
    throw new Error(`no source file is mapped to ${specifier}`);
  }

  return import(path.resolve(PACKAGE_ROOT, source));
};

/**
 * How the two answers are compared. `equal`: deep equality of the (awaited) results. `type`: both
 * have the same typeof (a clock, a random id). `identity`: the same object. `shape`: the call needs
 * I/O or changes shared state, so only the exports are checked.
 */
type TCompare = 'equal' | 'type' | 'identity' | 'shape';

interface ISample {
  args: () => unknown[];
  compare: TCompare;
  /** Reduces an answer to something comparable, e.g. an error to its message. */
  normalize?: (value: unknown) => unknown;
}

const silentLogger = {
  debug: () => undefined,
  for: () => ({ error: () => undefined }),
};

const formWith = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return form;
};

const nameOf = (value: unknown) => (value as { constructor: { name: string } }).constructor.name;
const messageOf = (value: unknown) => (value as Error).message;
const namesOf = (value: unknown) =>
  (Array.isArray(value) ? value : [value]).map((plugin) => (plugin as { name: string }).name);

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const REFUSED = { normalized: { code: 'core.url_safety.url_refused' } };

const SAMPLES: Record<string, ISample> = {
  getPerformanceCheckpoint: { args: () => [], compare: 'type' },
  getExecutedPerformance: { args: () => [{ from: 0 }], compare: 'type' },
  executeWithPerformanceMeasure: {
    args: () => [{ scope: 'sample', logger: silentLogger, task: () => 5 }],
    compare: 'equal',
  },
  hrTime: { args: () => [], compare: 'type' },
  parseMultipartBody: {
    args: () => {
      const form = formWith({ a: '1' });
      return [{ context: { req: { formData: async () => form } } }];
    },
    compare: 'equal',
  },
  sanitizeFilename: { args: () => ['../a b?.txt'], compare: 'equal' },
  encodeRFC5987: { args: () => ["é'()*"], compare: 'equal' },
  createContentDispositionHeader: {
    args: () => [{ filename: 'a é.txt', type: 'attachment' }],
    compare: 'equal',
  },
  parseContentDisposition: {
    args: () => [{ header: 'attachment; filename="a.txt"' }],
    compare: 'equal',
  },
  readFormBody: {
    args: () => {
      const form = formWith({ a: '1' });
      return [{ req: { formData: async () => form } }];
    },
    compare: 'equal',
    normalize: (value) => [...(value as FormData).entries()],
  },
  getUID: { args: () => [], compare: 'type' },
  toCamel: { args: () => ['a_b-c'], compare: 'equal' },
  keysToCamel: { args: () => [{ a_b: { c_d: 1 } }], compare: 'equal' },
  isInt: { args: () => ['5'], compare: 'equal' },
  isFloat: { args: () => ['1.5'], compare: 'equal' },
  int: { args: () => ['1,234'], compare: 'equal' },
  float: { args: () => ['3.14159', 3], compare: 'equal' },
  toBoolean: { args: () => ['false'], compare: 'equal' },
  parseArrayToMapWithKey: { args: () => [[{ id: 1 }, { id: 2 }], 'id'], compare: 'equal' },
  toDelimitedArray: { args: () => ['a, b;c', ';'], compare: 'equal' },
  blankToUndefined: { args: () => ['  x '], compare: 'equal' },
  toTrimmed: { args: () => [' a '], compare: 'equal' },
  getDeepProperty: { args: () => [{ a: { b: 1 } }, 'a.b'], compare: 'equal' },
  sleep: { args: () => [1], compare: 'equal' },
  executePromiseWithLimit: {
    args: () => [{ tasks: [async () => 1, async () => 2], limit: 1 }],
    compare: 'equal',
  },
  voidExecution: { args: () => [{ scope: 'sample', execution: 1 }], compare: 'equal' },
  toError: { args: () => ['boom'], compare: 'equal', normalize: messageOf },
  isNotFoundError: { args: () => [{ error: { status: 404 } }], compare: 'equal' },
  toExpirySeconds: {
    args: () => [{ expiresIn: StoragePresignDefaults.PUT_EXPIRES_IN, operation: 'sample' }],
    compare: 'equal',
  },
  createUuidV4: { args: () => [], compare: 'type' },
  uuidV4: { args: () => [], compare: 'type' },
  createUuidV5: { args: () => [], compare: 'type' },
  uuidV5: { args: () => [{ namespace: NAMESPACE, name: 'sample' }], compare: 'equal' },
  createUuidV7: { args: () => [], compare: 'type' },
  uuidV7: { args: () => [], compare: 'type' },
  redactSecrets: { args: () => [{ password: 'x', a: 1 }], compare: 'equal' },
  toJsonSafe: { args: () => [{ value: { a: 1 }, depth: 2 }], compare: 'equal' },
  redactUrlCredentials: { args: () => ['https://user:hunter2@host/'], compare: 'equal' },
  resolveClass: { args: () => [{ ref: 'binding.key' }], compare: 'equal' },
  createRedisHelper: { args: () => [], compare: 'shape' },
  createSecretsHelper: {
    args: () => [{ provider: SecretProviders.SYSTEM_ENVS }],
    compare: 'equal',
    normalize: nameOf,
  },
  waitForRedisReady: { args: () => [{ client: { status: 'ready' } }], compare: 'equal' },
  ensureRedisClientsConnecting: {
    args: () => [{ clients: [{ status: 'ready' }], scope: 'sample' }],
    compare: 'equal',
  },
  isUrlRefusedError: { args: () => [{ error: REFUSED }], compare: 'equal' },
  toQueryString: { args: () => [{ params: { a: [1, 2], b: 'x y' } }], compare: 'equal' },
  invokeHook: {
    args: () => [{ logger: silentLogger, scope: 'sample', execution: () => undefined }],
    compare: 'equal',
  },
  awaitHook: {
    args: () => [{ logger: silentLogger, scope: 'sample', execution: () => undefined }],
    compare: 'equal',
  },
  resolveLoggerLevel: { args: () => [{ configured: 'info' }], compare: 'equal' },
  resolveLoggerColorize: { args: () => [{ configured: 'true' }], compare: 'equal' },
  formatLogMessage: { args: () => [{ message: 'a %s', args: ['b'] }], compare: 'equal' },
  buildPinoOptions: { args: () => [], compare: 'equal' },
  getPinoBackingLogger: { args: () => [], compare: 'identity' },
  setPinoBackingLogger: { args: () => [], compare: 'shape' },
  mapFrequency: { args: () => ['1d'], compare: 'equal' },
  mapMaxFilesToCount: { args: () => [{ value: '5d', frequency: 'daily' }], compare: 'equal' },
  resolveDestinationPlan: { args: () => [], compare: 'equal' },
  buildDestination: { args: () => [{ kind: 'stdout' }], compare: 'equal' },
  defineCustomLogger: { args: () => [], compare: 'shape' },
  defineJsonLoggerFormatter: { args: () => [{ label: 'sample' }], compare: 'type' },
  defineLogFormatter: { args: () => [{ label: 'sample' }], compare: 'type' },
  definePrettyLoggerFormatter: { args: () => [{ label: 'sample' }], compare: 'type' },
  resolveDefaultTransportOptions: { args: () => [], compare: 'shape' },
  deepSplat: { args: () => [], compare: 'type' },
  platformaticRequirePlugin: { args: () => [], compare: 'equal', normalize: namesOf },
  platformaticWasmPlugin: { args: () => [], compare: 'equal', normalize: namesOf },
  platformaticKafkaPlugins: { args: () => [], compare: 'equal', normalize: namesOf },
};

/** The options object of the new form: each old positional argument under its key, an unset optional one left out. */
const buildOptions = (opts: { entry: IMappingEntry; args: unknown[] }): unknown[] => {
  const { entry, args } = opts;
  if (entry.keepsOptions) {
    return args;
  }

  if (entry.params.length === 0) {
    return [];
  }

  const options: Record<string, unknown> = {};
  entry.params.forEach((parameter, index) => {
    if (index < args.length) {
      options[parameter.key] = args[index];
    }
  });
  return [options];
};

const settle = async (opts: { value: unknown; normalize?: (value: unknown) => unknown }) => {
  const resolved = await opts.value;
  return opts.normalize ? opts.normalize(resolved) : resolved;
};

describe('the helpers entries of the namespace-functions table', () => {
  test('the table is not empty and every entry has a sample', () => {
    expect(HELPERS_MAPPINGS.length).toBeGreaterThan(0);

    const missing = HELPERS_MAPPINGS.filter((entry) => !SAMPLES[entry.oldName]).map(
      (entry) => entry.oldName,
    );
    expect(missing).toEqual([]);
  });

  test('no sample is left without an entry', () => {
    const names = new Set(HELPERS_MAPPINGS.map((entry) => entry.oldName));
    expect(Object.keys(SAMPLES).filter((name) => !names.has(name))).toEqual([]);
  });

  for (const entry of HELPERS_MAPPINGS) {
    describe(`${entry.oldName} -> ${entry.className}.${entry.method}`, () => {
      for (const specifier of entry.modules) {
        test(`from ${specifier}: the old name is a function, the class has the static method`, async () => {
          const loaded = await loadModule(specifier);
          const classModule = await loadModule(entry.newModules?.[0] ?? specifier);

          expect(typeof loaded[entry.oldName]).toBe('function');

          const klass = classModule[entry.className] as Record<string, unknown> | undefined;
          expect(typeof klass).toBe('function');
          expect(typeof klass?.[entry.method]).toBe('function');
        });
      }

      test('the old call and the new call give the same answer', async () => {
        const sample = SAMPLES[entry.oldName];
        if (!sample) {
          throw new Error(`${entry.oldName} has no sample`);
        }

        if (sample.compare === 'shape') {
          return;
        }

        const loaded = await loadModule(entry.modules[0]);
        const classModule = await loadModule(entry.newModules?.[0] ?? entry.modules[0]);
        const oldFunction = loaded[entry.oldName] as (...args: unknown[]) => unknown;
        const klass = classModule[entry.className] as Record<
          string,
          (...args: unknown[]) => unknown
        >;

        const args = sample.args();
        const oldAnswer = await settle({
          value: oldFunction(...args),
          normalize: sample.normalize,
        });
        const newAnswer = await settle({
          value: klass[entry.method](...buildOptions({ entry, args: sample.args() })),
          normalize: sample.normalize,
        });

        switch (sample.compare) {
          case 'type': {
            expect(typeof newAnswer).toBe(typeof oldAnswer);
            break;
          }
          case 'identity': {
            expect(newAnswer).toBe(oldAnswer);
            break;
          }
          default: {
            expect(newAnswer).toEqual(oldAnswer);
          }
        }
      });
    });
  }
});

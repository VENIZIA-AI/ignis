import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from '@hono/zod-openapi';

/**
 * The codemod table for this package (`devz codemod namespace-functions`) is only as good as its
 * entries: a wrong `modules` list is a silent miss and a wrong `params` order a wrong rewrite. This
 * loads the table and, for each entry, checks that the old name and the class exist where the table
 * says, and that a call of the old form gives what the new form built from `params` gives.
 */

interface IMapping {
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  newModules?: string[];
  params: Array<{ key: string; optional?: boolean }>;
  restKey?: string;
  keepsOptions?: boolean;
}

/** The repository root: the nearest parent that holds the dev-configs package (tests run from the package or from the root). */
const findRoot = (): string => {
  let current = process.cwd();
  while (!existsSync(join(current, 'packages/dev-configs/package.json'))) {
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`[namespace-mapping] Repository root not found from ${process.cwd()}`);
    }
    current = parent;
  }
  return current;
};

const ROOT = findRoot();
const MAPPING_SOURCE = join(
  ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/kernel.ts',
);

/** The module specifiers of this package, at the source entry each one is built from. */
const loadEntry = async (opts: {
  module: string;
}): Promise<Record<string, unknown> | undefined> => {
  switch (opts.module) {
    case '@venizia/ignis-kernel': {
      return import('../index');
    }
    case '@venizia/ignis-kernel/metadata': {
      return import('../metadata');
    }
    case '@venizia/ignis-kernel/repository': {
      return import('../repository');
    }
    default: {
      return undefined;
    }
  }
};

/** `@venizia/ignis` re-exports the whole kernel root, which is what makes its entry list right. */
const CORE_SERVER_INDEX = join(ROOT, 'packages/core-server/src/index.ts');

/** Reduces a result to what two equal results share: zod schemas by their type, functions by name. */
const toShape = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'function') {
    return 'function';
  }

  if (value === null || typeof value !== 'object' || depth > 6) {
    return value;
  }

  if ('_zod' in value) {
    return `zod:${(value as { _zod: { def: { type: string } } })._zod.def.type}`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toShape(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toShape(item, depth + 1)]),
  );
};

const run = async (opts: { call: () => unknown }): Promise<unknown> => {
  try {
    const value = await opts.call();
    return toShape(value);
  } catch (error) {
    return { thrown: (error as Error).message };
  }
};

const selectSchema = z.object({ id: z.string(), name: z.string() });
const context = { marker: true };
const getContext = {
  req: { header: () => 'h', param: () => 'p', query: () => 'q' },
  get: () => 'c',
};
class ProbeController {}
const SNAKE_KEY = 'first_name';

/** One sample call per entry, in the old form. `probe` reads a result that is not comparable as it is. */
const SAMPLES: Record<string, { args: unknown[]; probe?: (result: unknown) => unknown }> = {
  htmlContent: { args: [{ description: 'A page', required: true }] },
  htmlResponse: { args: [{ description: 'A page' }] },
  jsonContent: { args: [{ schema: z.string(), description: 'Body' }] },
  errorResponses: { args: [] },
  jsonResponse: { args: [{ schema: z.string(), description: 'Done' }] },
  requiredString: {
    args: [{ min: 2 }],
    probe: (result) =>
      ['', 'a', 'ab'].map((input) => (result as z.ZodString).safeParse(input).success),
  },
  idParamsSchema: {
    args: [{ idType: 'string' }],
    probe: (result) => (result as z.ZodObject).safeParse({ id: 'x' }).success,
  },
  asTypedContext: { args: [context] },
  registerFactoryRepositoryInjection: {
    args: [
      {
        target: ProbeController,
        factoryName: 'defineProbeController',
        controllerName: 'ProbeController',
        repositoryName: 'ProbeRepository',
      },
    ],
  },
  toContentRange: { args: [{ range: { start: 0, end: 1, total: 5 }, count: 2 }] },
  buildDataRange: { args: [{ offset: 1, dataLength: 2, total: 9 }] },
  toEntityId: { args: [{ value: 'M1' }] },
  snakeToCamel: {
    args: [{ [SNAKE_KEY]: z.string() }],
    probe: (result) => (result as z.ZodType).parse({ [SNAKE_KEY]: 'Ada' }),
  },
  readDeclarative: {
    args: [{ source: { from: 'header', key: 'k', type: 'T' }, context: getContext }],
  },
  resolveRequestDomain: {
    args: [
      {
        spec: { domain: { from: 'param', key: 'id', type: 'Merchant' } },
        context: getContext,
        options: null,
      },
    ],
  },
  pickRegistrationOptions: { args: [{ metadata: { scope: 'singleton', order: 2 } }] },
  emojiFavicon: { args: [{ icon: 'X' }] },
  throwNotSupported: {
    args: [
      {
        scope: 'Probe',
        feature: 'Transactions',
        logger: { for: () => ({ warn: () => undefined }) },
      },
    ],
  },
  conditionalCountResponse: { args: [z.string()] },
  resolveCountConfig: { args: [{ config: undefined, isStrict: true }] },
  resolveFindConfig: { args: [{ config: undefined, selectSchema }] },
  resolveFindByIdConfig: { args: [{ idType: 'string', config: undefined, selectSchema }] },
  resolveFindOneConfig: { args: [{ config: undefined, selectSchema }] },
  resolveCreateConfig: {
    args: [{ config: undefined, selectSchema, createSchema: selectSchema }],
  },
  defineControllerRouteConfigs: {
    args: [
      {
        isStrict: true,
        idType: 'string',
        schema: { select: selectSchema, create: selectSchema, update: selectSchema },
      },
    ],
  },
};

/** The new call's arguments: an entry with parameters wraps the old positional arguments under their keys; one without passes them on unchanged. */
const toNewArgs = (opts: { mapping: IMapping; args: unknown[] }): unknown[] => {
  const { mapping, args } = opts;
  if (mapping.keepsOptions) {
    return args;
  }

  return [
    Object.fromEntries(
      mapping.params.slice(0, args.length).map((parameter, index) => [parameter.key, args[index]]),
    ),
  ];
};

const loaded: { KERNEL_MAPPINGS: ReadonlyArray<IMapping> } = await import(MAPPING_SOURCE);
const mappings = loaded.KERNEL_MAPPINGS;

describe('the kernel codemod table', () => {
  test('lists entries, and every one has a sample below', () => {
    expect(mappings.length).toBeGreaterThan(0);

    const unsampled = mappings.filter((mapping) => !(mapping.oldName in SAMPLES));
    expect(unsampled.map((mapping) => mapping.oldName)).toEqual([]);
  });

  test('@venizia/ignis re-exports the kernel root', () => {
    expect(readFileSync(CORE_SERVER_INDEX, 'utf8')).toContain(
      "export * from '@venizia/ignis-kernel';",
    );
  });

  for (const mapping of mappings) {
    const label = `${mapping.oldName} -> ${mapping.className}.${mapping.method}`;

    describe(label, () => {
      test('the old name is a function and the class has the static method, in every module listed', async () => {
        for (const module of mapping.modules) {
          const entry = await loadEntry({ module });
          if (module === '@venizia/ignis') {
            continue;
          }

          expect(entry, `${module} is not a kernel entry`).toBeDefined();
          expect(typeof entry?.[mapping.oldName], `${module} exports ${mapping.oldName}`).toBe(
            'function',
          );

          const classes = await Promise.all(
            (mapping.newModules ?? [module]).map((newModule) => loadEntry({ module: newModule })),
          );
          for (const classEntry of classes) {
            const target = classEntry?.[mapping.className] as Record<string, unknown> | undefined;
            expect(typeof target, `${module} exports ${mapping.className}`).toBe('function');
            expect(typeof target?.[mapping.method]).toBe('function');
          }
        }
      });

      test('the old call and the new call built from params give the same result', async () => {
        const sample = SAMPLES[mapping.oldName];
        const entry = await loadEntry({ module: '@venizia/ignis-kernel' });
        const oldFunction = entry?.[mapping.oldName] as (...args: unknown[]) => unknown;
        const target = entry?.[mapping.className] as Record<
          string,
          (...args: unknown[]) => unknown
        >;
        if (!sample || !oldFunction || !target) {
          throw new Error(`[namespace-mapping] ${label} has no sample or no export`);
        }

        const probe = sample.probe ?? ((result: unknown) => result);
        const newArgs = toNewArgs({ mapping, args: sample.args });
        const method = target[mapping.method];

        const oldResult = await run({
          call: async () => {
            const result = await oldFunction(...sample.args);
            return probe(result);
          },
        });
        const newResult = await run({
          call: async () => {
            const result = await method?.call(target, ...newArgs);
            return probe(result);
          },
        });

        expect(newResult).toEqual(oldResult);
      });
    });
  }
});

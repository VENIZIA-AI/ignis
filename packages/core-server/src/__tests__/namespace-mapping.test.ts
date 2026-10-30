import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

/**
 * The deprecated aliases of `@venizia/ignis` and the table `devz codemod namespace-functions` reads
 * (`mappings/core-server.ts`): each old name still works, each class has the static method the table
 * names, and the old call equals the new call the table would write.
 */
const ROOT = join(__dirname, '../../../..');
const MAPPING_SOURCE = join(
  ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/core-server.ts',
);

interface IParam {
  key: string;
  optional?: boolean;
}

interface IEntry {
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  newModules?: string[];
  params: IParam[];
  keepsOptions?: boolean;
}

type TModule = Record<string, unknown>;
type TFunction = (...args: unknown[]) => unknown;

/** Each module specifier the table names, mapped to the source entry that `exports` points at. */
const ENTRIES: Record<string, () => Promise<TModule>> = {
  '@venizia/ignis': () => import('../index'),
  '@venizia/ignis/mail': () => import('../components/mail'),
  '@venizia/ignis/static-asset': () => import('../components/static-asset'),
  '@venizia/ignis/testing': () => import('../testing'),
};

/**
 * A `keepsOptions` entry keeps its call, so its old and new calls are compared in the alias tests
 * below: a case in `ALIAS_CASES`, or one of these dedicated tests, each naming the class and method
 * the entry must point at.
 */
const DEDICATED_TESTS: Record<string, string> = {
  defineAuthController: 'AuthControllerFactory.define',
  buildCommitToken: 'AssetCommitToken.build',
  readCommitToken: 'AssetCommitToken.read',
  findLabelsInQuery: 'AssetControllerFactory.findLabelsInQuery',
  buildObjectLink: 'AssetControllerFactory.buildObjectLink',
  resolveServedContentType: 'AssetControllerFactory.resolveServedContentType',
};

const isCompared = (entry: IEntry): boolean =>
  entry.keepsOptions
    ? ALIAS_CASES.some(
        (aliasCase) =>
          aliasCase.oldName === entry.oldName &&
          aliasCase.className === entry.className &&
          aliasCase.method === entry.method,
      ) || DEDICATED_TESTS[entry.oldName] === `${entry.className}.${entry.method}`
    : SAMPLES[entry.oldName] !== undefined;

/** What the old call is compared with: the arguments of the old form, and how to compare results. */
interface ISample {
  args: unknown[];
  /** Results that carry a clock, a random value or a driver object are reduced to what must match. */
  normalize?: (result: unknown) => unknown;
  /** The call needs a booted application: only the shapes are asserted. */
  isShapeOnly?: boolean;
}

const MESSAGE = {
  from: 'Jane <jane@example.com>',
  to: 'bob@example.com',
  subject: 'hello',
  text: 'body',
};

const SAMPLES: Record<string, ISample> = {
  readRuntimeSnapshot: { args: [] },
  extraRoleColumns: { args: [], normalize: (result) => Object.keys(result as object) },
  splitAddressList: { args: ['a@x.com, "Doe, Jane" <jane@x.com>'] },
  formatAddressHeader: { args: [['Jane <jane@x.com>', 'bob@x.com']] },
  buildRawMimeMessage: {
    args: [MESSAGE],
    normalize: (result) => (result as Buffer).toString('utf8').includes('Subject: hello'),
  },
  getExpiryTime: {
    args: [5],
    normalize: (result) => Math.round((result as Date).getTime() / 60_000),
  },
  getExpiryTimeInHours: {
    args: [2],
    normalize: (result) => Math.round((result as Date).getTime() / 60_000),
  },
  assertApplicationBoots: { args: [], isShapeOnly: true },
};

const buildOptions = (opts: { params: IParam[]; args: unknown[] }): Record<string, unknown> =>
  Object.fromEntries(
    opts.params.slice(0, opts.args.length).map((param, index) => [param.key, opts.args[index]]),
  );

const loadEntries = async (): Promise<IEntry[]> => {
  const loaded: Record<string, unknown> = await import(MAPPING_SOURCE);
  return loaded.CORE_SERVER_MAPPINGS as IEntry[];
};

describe('core-server namespace mapping', () => {
  test('the table has entries and every entry has a sample', async () => {
    const entries = await loadEntries();

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(isCompared(entry), `no sample for ${entry.oldName}`).toBe(true);
      if (entry.keepsOptions) {
        expect(entry.params, `${entry.oldName} keeps its options`).toEqual([]);
      }
    }
  });

  test('every module of every entry loads and exports the old name and the class', async () => {
    const entries = await loadEntries();

    for (const entry of entries) {
      for (const specifier of entry.modules) {
        const load = ENTRIES[specifier];
        expect(load, `${specifier} has no source entry in this test`).toBeDefined();

        const loadedModule = await load();
        expect(typeof loadedModule[entry.oldName], `${specifier}#${entry.oldName}`).toBe(
          'function',
        );
      }

      for (const specifier of entry.newModules ?? entry.modules) {
        const loadedModule = await ENTRIES[specifier]();
        const owner = loadedModule[entry.className] as Record<string, unknown> | undefined;
        expect(typeof owner?.[entry.method], `${entry.className}.${entry.method}`).toBe('function');
      }
    }
  });

  test('the old call equals the new call the table writes', async () => {
    const entries = await loadEntries();

    for (const entry of entries.filter((candidate) => !candidate.keepsOptions)) {
      const sample = SAMPLES[entry.oldName];
      const loadedModule = await ENTRIES[entry.modules[0]]();
      const oldFunction = loadedModule[entry.oldName] as TFunction;
      const owner = (await ENTRIES[(entry.newModules ?? entry.modules)[0]]())[
        entry.className
      ] as Record<string, TFunction>;

      if (sample.isShapeOnly) {
        continue;
      }

      const normalize = sample.normalize ?? ((result: unknown) => result);
      const options = buildOptions({ params: entry.params, args: sample.args });
      const newCall =
        entry.params.length === 0 ? owner[entry.method]() : owner[entry.method](options);

      expect(await normalize(await oldFunction(...sample.args)), entry.oldName).toEqual(
        await normalize(await newCall),
      );
    }
  });
});

interface IAliasCase {
  oldName: string;
  className: string;
  method: string;
  /** The module the alias and the class both come from. */
  module: string;
  /** The arguments of the old form, and the options object of the new one. */
  oldArgs: unknown[];
  newArgs: unknown[];
  normalize?: (result: unknown) => unknown;
  /** The call throws: the messages must be the same. */
  isThrow?: boolean;
}

const COLUMN_KEYS = (result: unknown) => Object.keys(result as object);

const ALIAS_CASES: IAliasCase[] = [
  {
    oldName: 'assertBunRuntime',
    className: 'BunRuntimeGuard',
    method: 'assert',
    module: '@venizia/ignis',
    oldArgs: [{ runtime: { bunVersion: '1.4.0' } }],
    newArgs: [{ runtime: { bunVersion: '1.4.0' } }],
  },
  {
    oldName: 'assertBunRuntime',
    className: 'BunRuntimeGuard',
    method: 'assert',
    module: '@venizia/ignis',
    oldArgs: [{ runtime: { bunVersion: '1.3.9' } }],
    newArgs: [{ runtime: { bunVersion: '1.3.9' } }],
    isThrow: true,
  },
  {
    oldName: 'extraUserColumns',
    className: 'AuthModelColumns',
    method: 'buildUser',
    module: '@venizia/ignis',
    oldArgs: [{ idType: 'string' }],
    newArgs: [{ idType: 'string' }],
    normalize: COLUMN_KEYS,
  },
  {
    oldName: 'extraPermissionColumns',
    className: 'AuthModelColumns',
    method: 'buildPermission',
    module: '@venizia/ignis',
    oldArgs: [{ idType: 'string' }],
    newArgs: [{ idType: 'string' }],
    normalize: COLUMN_KEYS,
  },
  {
    oldName: 'extraPolicyDefinitionColumns',
    className: 'AuthModelColumns',
    method: 'buildPolicyDefinition',
    module: '@venizia/ignis',
    oldArgs: [{ idType: 'number' }],
    newArgs: [{ idType: 'number' }],
    normalize: COLUMN_KEYS,
  },
  {
    oldName: 'policyDefinitionDomainShapeCheck',
    className: 'AuthModelColumns',
    method: 'buildPolicyDefinitionDomainShapeCheck',
    module: '@venizia/ignis',
    oldArgs: [{ domainTypeColumn: 'kind', domainIdColumn: 'ref' }],
    newArgs: [{ domainTypeColumn: 'kind', domainIdColumn: 'ref' }],
  },
  {
    oldName: 'readResultRows',
    className: 'DrizzleResultUtility',
    method: 'readResultRows',
    module: '@venizia/ignis',
    oldArgs: [{ result: { rows: [{ id: 1 }] } }],
    newArgs: [{ result: { rows: [{ id: 1 }] } }],
  },
];

describe('core-server deprecated aliases', () => {
  for (const aliasCase of ALIAS_CASES) {
    test(`${aliasCase.oldName} equals ${aliasCase.className}.${aliasCase.method}${aliasCase.isThrow ? ' (same error)' : ''}`, async () => {
      const loadedModule = await ENTRIES[aliasCase.module]();
      const oldFunction = loadedModule[aliasCase.oldName] as TFunction;
      const owner = loadedModule[aliasCase.className] as Record<string, TFunction>;
      const normalize = aliasCase.normalize ?? ((result: unknown) => result);

      expect(typeof oldFunction).toBe('function');
      expect(typeof owner[aliasCase.method]).toBe('function');

      if (aliasCase.isThrow) {
        const thrown = (call: () => unknown) => {
          try {
            call();
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
          return undefined;
        };

        const oldMessage = thrown(() => oldFunction(...aliasCase.oldArgs));
        expect(oldMessage).toBeDefined();
        expect(oldMessage).toBe(thrown(() => owner[aliasCase.method](...aliasCase.newArgs)));
        return;
      }

      expect(normalize(oldFunction(...aliasCase.oldArgs))).toEqual(
        normalize(owner[aliasCase.method](...aliasCase.newArgs)),
      );
    });
  }

  test('defineAuthController builds the same controller as AuthControllerFactory.define', async () => {
    const loadedModule = await ENTRIES['@venizia/ignis']();
    const oldFunction = loadedModule.defineAuthController as TFunction;
    const owner = loadedModule.AuthControllerFactory as Record<string, TFunction>;

    const fromOld = oldFunction({ serviceKey: 'services.Auth' }) as { name: string };
    const fromNew = owner.define({ serviceKey: 'services.Auth' }) as { name: string };

    expect(typeof fromOld).toBe('function');
    expect(fromOld.name).toBe(fromNew.name);
  });

  test('buildCommitToken and readCommitToken equal AssetCommitToken.build and .read', async () => {
    const { buildCommitToken, readCommitToken, AssetCommitToken } =
      await import('../components/static-asset/common');
    const payload = { bucket: 'b', key: 'k', expiresAt: Date.now() + 60_000 };
    const secretKey = 'secret';

    const token = buildCommitToken({ payload, secretKey });
    expect(token).toBe(AssetCommitToken.build({ payload, secretKey }));
    expect(readCommitToken({ token, secretKey })).toEqual(
      AssetCommitToken.read({ token, secretKey }),
    );
  });

  test('findLabelsInQuery, buildObjectLink and resolveServedContentType equal their AssetControllerFactory statics', async () => {
    const { AssetControllerFactory, buildObjectLink, findLabelsInQuery, resolveServedContentType } =
      await import('../components/static-asset');

    const query = { principalId: '42', prefix: 'photos/' };
    expect(findLabelsInQuery({ query })).toEqual(
      AssetControllerFactory.findLabelsInQuery({ query }),
    );

    const location = {
      basePath: '/assets',
      bucket: { name: 'bucket' },
      object: { key: 'a b/c.png' },
    } as never;
    expect(buildObjectLink(location)).toBe(AssetControllerFactory.buildObjectLink(location));

    const helper = { getMimeType: () => 'image/png; charset=binary' } as never;
    const object = { key: 'a.png' } as never;
    expect(resolveServedContentType({ helper, object })).toEqual(
      AssetControllerFactory.resolveServedContentType({ helper, object }),
    );
  });

  test('the testing entry keeps assertApplicationBoots beside ApplicationBootAssertion', async () => {
    const testing = await ENTRIES['@venizia/ignis/testing']();

    expect(typeof testing.assertApplicationBoots).toBe('function');
    expect(typeof (testing.ApplicationBootAssertion as Record<string, unknown>).assert).toBe(
      'function',
    );
  });
});

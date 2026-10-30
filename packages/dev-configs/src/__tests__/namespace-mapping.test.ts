import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The deprecated aliases of `@venizia/dev-configs` and the table `devz codemod namespace-functions`
 * reads (`mappings/dev-configs.ts`): each old name still works, each class has the static method the
 * table names, and the old call equals the new call the table would write.
 */
const ROOT = join(__dirname, '../../../..');
const MAPPING_SOURCE = join(
  ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/dev-configs.ts',
);

const SCRATCH = join(__dirname, '../../../../.agents/local/tmp');
mkdirSync(SCRATCH, { recursive: true });
const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

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
  '@venizia/dev-configs': () => import('../index.js'),
  '@venizia/dev-configs/checks': () => import('../checks/index.js'),
  '@venizia/dev-configs/testing': () => import('../testing/index.js'),
  '@venizia/dev-configs/linters': () => import('../linters/index.js'),
};

/**
 * A `keepsOptions` entry keeps its call, so its old and new calls are compared in the alias tests
 * below: a case in `ALIAS_CASES`, or one of these dedicated tests, each naming the class and method
 * the entry must point at.
 */
const DEDICATED_TESTS: Record<string, string> = {
  runModuleCycles: 'ModuleCyclesCheck.run',
  formatTestWeight: 'TestWeightCheck.formatReport',
  probeEntry: 'PurityProbe.probeEntry',
  checkPurity: 'PurityCheck.run',
  findDeadTestCode: 'DeadTestCodeCheck.find',
  useRepoTmp: 'RepoTmp.apply',
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

interface ISample {
  /** Built per call: a rejected promise or a stream cannot be handed to two calls. */
  makeArgs: () => unknown[];
  normalize?: (result: unknown) => unknown;
}

const SAMPLES: Record<string, ISample> = {
  assertNoWorkspaceExternal: {
    makeArgs: () => [[{ label: 'lib', package: 'lib', entry: 'a.js', external: ['pg'] }]],
  },
  stripBundlerPathComments: {
    makeArgs: () => ['// packages/core-worker/dist/transport/in-process.js\nconst a = 1;'],
  },
  formatLedgerResults: {
    makeArgs: () => [[{ id: 'a', survivorRed: true, candidateRed: true, ok: true }]],
  },
  rejectionOf: {
    makeArgs: () => [Promise.reject(new Error('boom'))],
    normalize: (result) => (result as Error).message,
  },
  findRepositoryRoot: { makeArgs: () => [__dirname] },
};

const buildOptions = (opts: { params: IParam[]; args: unknown[] }): Record<string, unknown> =>
  Object.fromEntries(
    opts.params.slice(0, opts.args.length).map((param, index) => [param.key, opts.args[index]]),
  );

const loadEntries = async (): Promise<IEntry[]> => {
  const loaded: Record<string, unknown> = await import(MAPPING_SOURCE);
  return loaded.DEV_CONFIGS_MAPPINGS as IEntry[];
};

describe('dev-configs namespace mapping', () => {
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
      const oldFunction = (await ENTRIES[entry.modules[0]]())[entry.oldName] as TFunction;
      const owner = (await ENTRIES[(entry.newModules ?? entry.modules)[0]]())[
        entry.className
      ] as Record<string, TFunction>;
      const normalize = sample.normalize ?? ((result: unknown) => result);

      const oldArgs = sample.makeArgs();
      const options = buildOptions({ params: entry.params, args: sample.makeArgs() });
      const newCall = owner[entry.method](options);

      expect(await normalize(await oldFunction(...oldArgs)), entry.oldName).toEqual(
        await normalize(await newCall),
      );
    }
  });
});

interface IAliasCase {
  oldName: string;
  className: string;
  method: string;
  module: string;
  /** The arguments of the old form and of the new one; built per call. */
  makeOldArgs: () => unknown[];
  makeNewArgs: () => unknown[];
  normalize?: (result: unknown) => unknown;
}

const makeFolder = (): string => {
  const folder = mkdtempSync(join(SCRATCH, 'namespace-'));
  folders.push(folder);
  return folder;
};

const CHECKS = '@venizia/dev-configs/checks';
const TESTING = '@venizia/dev-configs/testing';
const HOUSE = '@venizia/dev-configs/linters';

const EXAMPLE_LEDGER_RESULT = [{ id: 'a', survivorRed: true, candidateRed: true, ok: true }];

const ALIAS_CASES: IAliasCase[] = [
  {
    oldName: 'findCatalogProblems',
    className: 'CatalogCheck',
    method: 'find',
    module: CHECKS,
    makeOldArgs: () => [{ root: ROOT }],
    makeNewArgs: () => [{ root: ROOT }],
  },
  {
    oldName: 'assertNoWorkspaceExternal',
    className: 'PurityManifest',
    method: 'assertNoWorkspaceExternal',
    module: CHECKS,
    makeOldArgs: () => [[{ label: 'a', package: 'a', entry: 'a.js', external: ['pg'] }], '@acme/'],
    makeNewArgs: () => [
      {
        manifest: [{ label: 'a', package: 'a', entry: 'a.js', external: ['pg'] }],
        workspaceScope: '@acme/',
      },
    ],
  },
  {
    oldName: 'deriveEntries',
    className: 'PurityManifest',
    method: 'deriveEntries',
    module: CHECKS,
    makeOldArgs: () => [{ claim: { package: 'inversion' }, root: ROOT }],
    makeNewArgs: () => [{ claim: { package: 'inversion' }, root: ROOT }],
  },
  {
    oldName: 'assertBrowserEsmEntry',
    className: 'PurityManifest',
    method: 'assertBrowserEsmEntry',
    module: CHECKS,
    makeOldArgs: () => [
      { claims: [{ package: 'inversion' }], root: ROOT, esmEntryPrefix: './dist/' },
    ],
    makeNewArgs: () => [
      { claims: [{ package: 'inversion' }], root: ROOT, esmEntryPrefix: './dist/' },
    ],
  },
  {
    oldName: 'buildManifest',
    className: 'PurityManifest',
    method: 'build',
    module: CHECKS,
    makeOldArgs: () => [{ claims: [{ package: 'inversion' }], root: ROOT }],
    makeNewArgs: () => [{ claims: [{ package: 'inversion' }], root: ROOT }],
  },
  {
    oldName: 'listTestTitles',
    className: 'TestControlsCheck',
    method: 'listTitles',
    module: CHECKS,
    makeOldArgs: () => [{ source: "describe('a', () => { test('b', () => {}); });" }],
    makeNewArgs: () => [{ source: "describe('a', () => { test('b', () => {}); });" }],
  },
  {
    oldName: 'checkControls',
    className: 'TestControlsCheck',
    method: 'run',
    module: CHECKS,
    makeOldArgs: () => [{ root: ROOT, controls: [] }],
    makeNewArgs: () => [{ root: ROOT, controls: [] }],
  },
  {
    oldName: 'replayLedger',
    className: 'TestMutateCheck',
    method: 'replayLedger',
    module: CHECKS,
    makeOldArgs: () => [{ root: ROOT, ledger: { mutants: [] } }],
    makeNewArgs: () => [{ root: ROOT, ledger: { mutants: [] } }],
  },
  {
    oldName: 'formatLedgerResults',
    className: 'TestMutateCheck',
    method: 'formatLedgerResults',
    module: CHECKS,
    makeOldArgs: () => [EXAMPLE_LEDGER_RESULT],
    makeNewArgs: () => [{ results: EXAMPLE_LEDGER_RESULT }],
  },
  {
    oldName: 'analyseJunit',
    className: 'TestWeightCheck',
    method: 'analyseJunit',
    module: CHECKS,
    makeOldArgs: () => [{ reports: [] }],
    makeNewArgs: () => [{ reports: [] }],
  },
  {
    oldName: 'rejectionOf',
    className: 'RejectionHelper',
    method: 'rejectionOf',
    module: TESTING,
    makeOldArgs: () => [Promise.reject(new Error('boom'))],
    makeNewArgs: () => [{ task: Promise.reject(new Error('boom')) }],
    normalize: (result) => (result as Error).message,
  },
  {
    oldName: 'expectRejection',
    className: 'RejectionHelper',
    method: 'expectRejection',
    module: TESTING,
    makeOldArgs: () => [{ task: Promise.reject(new Error('boom')), message: 'boom' }],
    makeNewArgs: () => [{ task: Promise.reject(new Error('boom')), message: 'boom' }],
  },
  {
    oldName: 'spawnSyncBounded',
    className: 'SpawnHelper',
    method: 'spawnSyncBounded',
    module: TESTING,
    makeOldArgs: () => [{ cmd: ['sh', '-c', 'printf ok; exit 3'] }],
    makeNewArgs: () => [{ cmd: ['sh', '-c', 'printf ok; exit 3'] }],
    normalize: (result) => {
      const spawned = result as { exitCode: number; stdout: Buffer };
      return { exitCode: spawned.exitCode, stdout: spawned.stdout.toString() };
    },
  },
  {
    oldName: 'readField',
    className: 'AstNode',
    method: 'readField',
    module: HOUSE,
    makeOldArgs: () => [{ node: { type: 'Identifier', name: 'a' }, key: 'name' }],
    makeNewArgs: () => [{ node: { type: 'Identifier', name: 'a' }, key: 'name' }],
  },
  {
    oldName: 'nodeType',
    className: 'AstNode',
    method: 'getType',
    module: HOUSE,
    makeOldArgs: () => [{ node: { type: 'Identifier' } }],
    makeNewArgs: () => [{ node: { type: 'Identifier' } }],
  },
];

describe('dev-configs deprecated aliases', () => {
  for (const aliasCase of ALIAS_CASES) {
    test(`${aliasCase.oldName} equals ${aliasCase.className}.${aliasCase.method}`, async () => {
      const loadedModule = await ENTRIES[aliasCase.module]();
      const oldFunction = loadedModule[aliasCase.oldName] as TFunction;
      const owner = loadedModule[aliasCase.className] as Record<string, TFunction>;
      const normalize = aliasCase.normalize ?? ((result: unknown) => result);

      expect(typeof oldFunction).toBe('function');
      expect(typeof owner[aliasCase.method]).toBe('function');

      const fromOld = await normalize(await oldFunction(...aliasCase.makeOldArgs()));
      const fromNew = await normalize(await owner[aliasCase.method](...aliasCase.makeNewArgs()));

      expect(fromOld).toEqual(fromNew);
    });
  }

  test('formatTestWeight equals TestWeightCheck.formatReport', async () => {
    const checks = await ENTRIES[CHECKS]();
    const weight = checks.TestWeightCheck as Record<string, TFunction>;
    const report = weight.analyseJunit({ reports: [] });

    expect((checks.formatTestWeight as TFunction)({ report, top: 3 })).toEqual(
      weight.formatReport({ report, top: 3 }),
    );
  });

  test('runModuleCycles equals ModuleCyclesCheck.run', async () => {
    const checks = await ENTRIES[CHECKS]();
    const folder = makeFolder();
    writeFileSync(join(folder, 'a.js'), "import './b.js';\n");
    writeFileSync(join(folder, 'b.js'), "import './a.js';\n");

    const run = (call: TFunction) => {
      const printed: string[] = [];
      const errors: string[] = [];
      const code = call({
        args: [folder],
        print: (line: string) => printed.push(line),
        printError: (line: string) => errors.push(line),
      });
      return { code, printed, errors };
    };

    const fromOld = run(checks.runModuleCycles as TFunction);
    const fromNew = run((checks.ModuleCyclesCheck as Record<string, TFunction>).run);

    expect(fromOld).toEqual(fromNew);
    expect(fromOld.printed.join('\n')).toContain('1 cycle(s)');
  });

  test('stripBundlerPathComments equals PurityProbe.stripBundlerPathComments', async () => {
    const checks = await ENTRIES[CHECKS]();
    const text = '// packages/x/dist/in-process.js\nconst a = 1;';

    expect((checks.stripBundlerPathComments as TFunction)(text)).toBe(
      (checks.PurityProbe as Record<string, TFunction>).stripBundlerPathComments({ text }),
    );
  });

  test('the engines that need a bundler, git or a global patch are present in both forms', async () => {
    const checks = await ENTRIES[CHECKS]();
    const testing = await ENTRIES[TESTING]();

    const pairs: Array<[TModule, string, string, string]> = [
      [checks, 'probeEntry', 'PurityProbe', 'probeEntry'],
      [checks, 'checkPurity', 'PurityCheck', 'run'],
      [checks, 'findDeadTestCode', 'DeadTestCodeCheck', 'find'],
      [testing, 'useRepoTmp', 'RepoTmp', 'apply'],
    ];

    for (const [loadedModule, oldName, className, method] of pairs) {
      expect(typeof loadedModule[oldName], oldName).toBe('function');
      expect(typeof (loadedModule[className] as Record<string, unknown>)[method], className).toBe(
        'function',
      );
    }
  });
});

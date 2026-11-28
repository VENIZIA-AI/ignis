import { describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { BindingKeysCommand } from '../cli/codemod/binding-keys';
import { CodemodFiles } from '../cli/codemod/files';
import { TypedRouteContext } from '../cli/codemod/typed-route-context';
import { SatisfiesRewrite } from '../cli/codemod/typed-route-context-satisfies';
import { CliOutput } from '../common/cli-output';

/** The types the command asks: `valid()` answers the config's `body`, and `unknown` for a config that holds none. */
const FRAMEWORK = `export interface IAuthRouteConfig {
  method: 'get' | 'post';
  path: string;
  body?: unknown;
  authenticate?: { strategies: string[] };
}
export type TRouteContext = TContextOf<object>;
export type TContextOf<C extends object, E = unknown> = {
  req: {
    valid<K extends string>(target: K): C extends { body: infer B } ? B : unknown;
    valid<T = unknown>(target: string): T;
  };
};
export declare const post: (opts: { configs: object }) => MethodDecorator;
`;

const IMPORT = "import type { IAuthRouteConfig } from '@venizia/ignis';";

class Project {
  private constructor(
    readonly root: string,
    private readonly names: string[],
  ) {}

  static create(opts: {
    files: Record<string, string[]>;
    compilerOptions?: object;
    /** Folders that are projects of their own, with the compiler options of the root. */
    projects?: string[];
  }): Project {
    const root = mkdtempSync(join(tmpdir(), 'typed-satisfies-'));
    const all: Record<string, string[]> = {
      'node_modules/@venizia/ignis/package.json': [
        JSON.stringify({ name: '@venizia/ignis', types: 'index.d.ts' }),
      ],
      'node_modules/@venizia/ignis/index.d.ts': [FRAMEWORK],
      ...opts.files,
    };
    const config = [
      JSON.stringify({
        compilerOptions: {
          experimentalDecorators: true,
          strict: true,
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
          // The default libraries and every visible @types package triple the time of each check.
          lib: ['es2022'],
          types: [],
          ...opts.compilerOptions,
        },
      }),
    ];

    for (const folder of ['.', ...(opts.projects ?? [])]) {
      all[join(folder, 'tsconfig.json')] = config;
    }

    for (const [path, lines] of Object.entries(all)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), lines.join('\n'));
    }

    return new Project(root, Object.keys(opts.files));
  }

  async run(flags: string[]) {
    using log = spyOn(CliOutput, 'log').mockImplementation(() => {});
    using warn = spyOn(CliOutput, 'warn').mockImplementation(() => {});
    const code = await CodemodCommand.run({
      root: this.root,
      args: ['typed-route-context', ...this.names, ...flags],
    });

    return {
      code,
      log: log.mock.calls.flat().join('\n'),
      warn: warn.mock.calls.flat().join('\n'),
    };
  }

  read(path: string): string {
    return readFileSync(join(this.root, path), 'utf8');
  }

  errors(): string[] {
    const program = BindingKeysCommand.createProgram({
      typescript: ts,
      root: this.root,
      files: this.names.map((name) => join(this.root, name)),
    });

    return ts
      .getPreEmitDiagnostics(program)
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }

  [Symbol.dispose]() {
    rmSync(this.root, { recursive: true, force: true });
  }
}

describe('devz codemod typed-route-context: annotated configs become satisfies', () => {
  test('one run rewrites the annotation and types the handler of another file; a second changes nothing', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [
          IMPORT,
          'export const Routes: Record<string, IAuthRouteConfig> = {',
          "  A: { method: 'post', path: '/', body: { name: 1 } },",
          '};',
        ],
        'controller.ts': [
          "import { post, type TRouteContext } from '@venizia/ignis';",
          "import { Routes } from './routes';",
          'export class C {',
          '  @post({ configs: Routes.A })',
          "  a(context: TRouteContext): number { return context.req.valid<{ name: number }>('json').name; }",
          '}',
        ],
      },
    });

    const dry = await project.run([]);
    expect(dry.code).toBe(0);
    expect(dry.log).toContain('would change  routes.ts');

    const check = await project.run(['--check']);
    expect(check.code).toBe(1);
    expect(check.log).toContain('would change  routes.ts');
    expect(project.read('routes.ts')).toContain('Routes: Record<');

    const written = await project.run(['--write']);

    expect(written.code).toBe(0);
    expect(project.read('routes.ts')).toBe(
      [
        IMPORT,
        'export const Routes = {',
        "  A: { method: 'post', path: '/', body: { name: 1 } },",
        '} satisfies Record<string, IAuthRouteConfig>;',
      ].join('\n'),
    );
    expect(project.read('controller.ts')).toContain('context: TContextOf<typeof Routes.A>');
    expect(project.read('controller.ts')).toContain("context.req.valid('json').name");
    expect(project.errors()).toEqual([]);

    const again = await project.run(['--check']);
    expect(again.code).toBe(0);
    expect(again.log).toContain('0 file(s) would change');
  });

  test('every form the lint rule reports is rewritten, comments kept, and the output typechecks', async () => {
    const HEAD = "import type { IAuthRouteConfig } from '@venizia/ignis';";
    using project = Project.create({
      files: {
        'forms.ts': [
          HEAD,
          'type TRoutes = Record<string, IAuthRouteConfig>;',
          "export const one: IAuthRouteConfig = { method: 'get', path: '/' }; // after",
          "export const omitted: Omit<IAuthRouteConfig, 'method'> = { path: '/' };",
          "export const frozen: Readonly<Record<string, IAuthRouteConfig>> = { A: { method: 'get', path: '/' } };",
          "export const constant: Record<string, IAuthRouteConfig> = { A: { method: 'get', path: '/' } } as const;",
          "export const asserted = { method: 'get', path: '/' } as IAuthRouteConfig;",
          "export const both: IAuthRouteConfig = { method: 'get', path: '/' } as IAuthRouteConfig;",
          "export const members = { A: { method: 'get', path: '/' } as IAuthRouteConfig };",
          "export const aliased: TRoutes = { A: { method: 'get', path: '/' } };",
          'export class Statics {',
          '  /** The list route. */',
          "  static readonly LIST: IAuthRouteConfig = { method: 'get', path: '/' };",
          '}',
          'export const build = () => {',
          '  const local: /* why */ IAuthRouteConfig = {',
          '    // inside',
          "    method: 'get',",
          "    path: '/',",
          '  };',
          '  return local;',
          '};',
        ],
      },
    });

    expect(project.errors()).toEqual([]);
    const result = await project.run(['--write']);

    expect(result.warn).toBe('');
    expect(project.read('forms.ts')).toBe(
      [
        HEAD,
        'type TRoutes = Record<string, IAuthRouteConfig>;',
        "export const one = { method: 'get', path: '/' } satisfies IAuthRouteConfig; // after",
        "export const omitted = { path: '/' } satisfies Omit<IAuthRouteConfig, 'method'>;",
        "export const frozen = { A: { method: 'get', path: '/' } } satisfies Readonly<Record<string, IAuthRouteConfig>>;",
        "export const constant = { A: { method: 'get', path: '/' } } as const satisfies Record<string, IAuthRouteConfig>;",
        "export const asserted = { method: 'get', path: '/' } satisfies IAuthRouteConfig;",
        "export const both = { method: 'get', path: '/' } satisfies IAuthRouteConfig;",
        "export const members = { A: { method: 'get', path: '/' } satisfies IAuthRouteConfig };",
        "export const aliased = { A: { method: 'get', path: '/' } } satisfies TRoutes;",
        'export class Statics {',
        '  /** The list route. */',
        "  static readonly LIST = { method: 'get', path: '/' } satisfies IAuthRouteConfig;",
        '}',
        'export const build = () => {',
        '  const local /* why */ = {',
        '    // inside',
        "    method: 'get',",
        "    path: '/',",
        '  } satisfies IAuthRouteConfig;',
        '  return local;',
        '};',
      ].join('\n'),
    );
    expect(project.errors()).toEqual([]);
    const result2 = await project.run(['--check']);
    expect(result2.code).toBe(0);
  });
});

const LITERAL = "{ method: 'get', path: '/' }";
const RECORD = `{ A: ${LITERAL} }`;

/** Each case: the lines of `routes.ts`, those of a consumer of it, and what the listing says. */
const LEFT: ReadonlyArray<{
  name: string;
  routes: string[];
  consumer?: string[];
  reason: RegExp;
  compilerOptions?: object;
}> = [
  {
    name: 'let',
    routes: [`export let a: IAuthRouteConfig = ${LITERAL};`],
    reason: /routes\.ts:2 {2}a: declared with let/,
  },
  {
    name: 'no initializer',
    routes: ['export declare const a: IAuthRouteConfig;'],
    reason: /a: no initializer/,
  },
  {
    name: 'a value that is no object literal',
    routes: [
      `const make = (): IAuthRouteConfig => (${LITERAL});`,
      'export const a: IAuthRouteConfig = make();',
    ],
    reason: /routes\.ts:3 {2}a: its value is not an object literal/,
  },
  {
    name: 'a mutable class property',
    routes: [`export class C { static a: IAuthRouteConfig = ${LITERAL}; }`],
    reason: /a: a property that is not readonly/,
  },
  {
    name: 'the lint rule turned off',
    routes: [
      '// eslint-disable-next-line @venizia/typed-route-context -- built at run time',
      `export const a: IAuthRouteConfig = ${LITERAL};`,
    ],
    reason: /a: the lint rule is turned off here/,
  },
  {
    name: 'a property written in another file',
    routes: [`export const a: IAuthRouteConfig = ${LITERAL};`],
    consumer: ["import { a } from './routes';", "a.path = '/b';"],
    reason: /a: written at consumer\.ts:2/,
  },
  {
    name: 'keys added to a Record',
    routes: [
      `export const a: Record<string, IAuthRouteConfig> = ${RECORD};`,
      `a['B'] = ${LITERAL};`,
    ],
    reason: /a: written at routes\.ts:3/,
  },
  {
    name: 'delete',
    routes: [`export const a: Record<string, IAuthRouteConfig> = ${RECORD};`, 'delete a.A;'],
    reason: /a: written at routes\.ts:3/,
  },
  {
    name: 'Object.assign',
    routes: [
      `export const a: Record<string, IAuthRouteConfig> = ${RECORD};`,
      `Object.assign(a, { B: ${LITERAL} });`,
    ],
    reason: /a: written at routes\.ts:3/,
  },
  {
    name: 'a Record indexed by any string, with noImplicitAny off',
    routes: [`export const a: Record<string, IAuthRouteConfig> = ${RECORD};`],
    consumer: ["import { a } from './routes';", 'export const read = (key: string) => a[key];'],
    compilerOptions: { strict: false },
    reason: /a: indexed with a key that is not a literal at consumer\.ts:2/,
  },
  {
    name: 'a consumer that reads what only the annotation declares',
    routes: [`export const a: IAuthRouteConfig = ${LITERAL};`],
    consumer: ["import { a } from './routes';", 'export const strategies = a.authenticate;'],
    reason: /a: the typecheck fails with it: consumer\.ts:2 TS2339/,
  },
  {
    name: 'an exported value a declaration file cannot name',
    routes: [
      "import { make } from './consumer';",
      "export const a: IAuthRouteConfig = { method: make().method, path: '/', body: make() };",
    ],
    consumer: [
      "interface IHidden { method: 'get' }",
      "export const make = (): IHidden => ({ method: 'get' });",
    ],
    compilerOptions: { composite: true },
    reason: /a: the typecheck fails with it: routes\.ts:3 TS4023/,
  },
  {
    name: 'an as that hides a missing property',
    routes: ["export const a = { path: '/' } as IAuthRouteConfig;"],
    reason: /a: the typecheck fails with it: routes\.ts:2 TS1360/,
  },
];

describe('devz codemod typed-route-context: a config it cannot rewrite safely', () => {
  for (const item of LEFT) {
    test(`is listed and left: ${item.name}`, async () => {
      using project = Project.create({
        files: {
          'routes.ts': [IMPORT, ...item.routes],
          ...(item.consumer ? { 'consumer.ts': item.consumer } : {}),
        },
        compilerOptions: item.compilerOptions,
      });
      const before = project.read('routes.ts');

      const check = await project.run(['--check']);
      const written = await project.run(['--write']);

      expect(check.code).toBe(0);
      expect(check.warn).toMatch(item.reason);
      expect(written.warn).toMatch(item.reason);
      expect(project.read('routes.ts')).toBe(before);
    });
  }

  test('a safe config beside an unsafe one is still rewritten', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [
          IMPORT,
          `export const safe: IAuthRouteConfig = ${LITERAL};`,
          `export const unsafe: IAuthRouteConfig = ${LITERAL};`,
          'export const strategies = unsafe.authenticate;',
        ],
      },
    });

    await project.run(['--write']);

    expect(project.read('routes.ts')).toContain(
      `export const safe = ${LITERAL} satisfies IAuthRouteConfig;`,
    );
    expect(project.read('routes.ts')).toContain(`export const unsafe: IAuthRouteConfig = `);
    expect(project.errors()).toEqual([]);
  });

  test('without noImplicitAny, a key the object writes in brackets is read by it', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [
          IMPORT,
          `export const a: Record<string, IAuthRouteConfig> = { ['/a']: ${LITERAL} };`,
          "export const first = a['/a'];",
        ],
      },
      compilerOptions: { strict: false },
    });

    await project.run(['--write']);

    expect(project.read('routes.ts')).toContain('satisfies Record<string, IAuthRouteConfig>');
    expect(project.errors()).toEqual([]);
  });

  test('without noImplicitAny, a literal key the object does not hold is listed as such', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [
          IMPORT,
          `export const a: Record<string, IAuthRouteConfig> = ${RECORD};`,
          "export const other = a['B'];",
        ],
      },
      compilerOptions: { strict: false },
    });

    const result = await project.run([]);

    expect(result.code).toBe(0);
    expect(result.warn).toContain('a: indexed with a key the object does not hold at routes.ts:3');
  });

  test('an empty object filled later is not reported, as the lint rule does not', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [IMPORT, 'export const a: Record<string, IAuthRouteConfig> = {};'],
      },
    });

    const result = await project.run(['--write']);

    expect(result.warn).toBe('');
    expect(result.log).toContain('0 file(s) changed');
  });

  test('a file with local changes keeps its annotation, and the handler that reads it keeps valid<T>()', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [
          IMPORT,
          "export const Routes: Record<string, IAuthRouteConfig> = { A: { method: 'post', path: '/', body: 1 } };",
        ],
        'controller.ts': [
          "import { post, type TRouteContext } from '@venizia/ignis';",
          "import { Routes } from './routes';",
          'export class C {',
          '  @post({ configs: Routes.A })',
          "  a(context: TRouteContext): number { return context.req.valid<number>('json'); }",
          '}',
        ],
      },
    });
    using _dirty = spyOn(CodemodFiles, 'dirty').mockImplementation(
      ({ target }) => new Set(target.endsWith('routes.ts') ? [target] : []),
    );

    const result = await project.run(['--write']);

    expect(result.code).toBe(1);
    expect(result.warn).toContain('refused  routes.ts');
    expect(project.read('routes.ts')).toContain('Routes: Record<');
    expect(project.read('controller.ts')).toContain("context.req.valid<number>('json')");
    expect(project.errors()).toEqual([]);
  });
});

const NAMES = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
/** Eight configs, each safe on its own; line 2 declares `c1`. */
const EIGHT = NAMES.map((name) => `export const ${name}: IAuthRouteConfig = ${LITERAL};`);
const MAKE = "export const make = (): IAuthRouteConfig => ({ method: 'post', path: '/' });";

/** The configs of `routes` still declared wide. */
const wideIn = (text: string) =>
  [...text.matchAll(/const (\w+): /g)].map(([, name]) => name).filter((name) => name !== 'make');

describe('devz codemod typed-route-context: an error away from the config that causes it', () => {
  test('a registry pushed to: one of the configs it holds is enough to leave', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [
          IMPORT,
          ...EIGHT,
          MAKE,
          'export const REGISTRY = [c1, c2];',
          'REGISTRY.push(make());',
        ],
      },
    });
    using programs = spyOn(TypedRouteContext, 'programs');

    const result = await project.run(['--write']);

    // With one of the two declared wide, the array takes any config.
    expect(wideIn(project.read('routes.ts'))).toEqual(['c2']);
    expect(result.warn).toContain('c2: the typecheck fails with it: routes.ts:12 TS2345');
    expect(project.errors()).toEqual([]);
    // The text as it was, every candidate, those not suspected, each of two suspects, and the handler step's two asks.
    expect(programs.mock.calls.length).toBeLessThanOrEqual(7);
  });

  test('keyof typeof a Record, used in another statement: only that Record is left', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [
          IMPORT,
          ...EIGHT,
          `export const UserRoutes: Record<string, IAuthRouteConfig> = ${RECORD};`,
          'type TName = keyof typeof UserRoutes;',
          'export const pick = (name: string): TName => name;',
        ],
      },
    });

    const result = await project.run(['--write']);

    expect(wideIn(project.read('routes.ts'))).toEqual(['UserRoutes']);
    expect(result.warn).toContain('UserRoutes: the typecheck fails with it: routes.ts:12 TS2322');
    expect(project.errors()).toEqual([]);
  });

  test('a let of another project that starts as a config: only that config is left', async () => {
    using project = Project.create({
      files: {
        'lib/routes.ts': [IMPORT, ...EIGHT],
        'app/consumer.ts': [
          IMPORT,
          "import { c1 } from '../lib/routes';",
          'declare const fallback: () => IAuthRouteConfig;',
          'export let active = c1;',
          'active = fallback();',
        ],
      },
      projects: ['lib', 'app'],
    });

    const result = await project.run(['--write']);

    expect(wideIn(project.read('lib/routes.ts'))).toEqual(['c1']);
    expect(result.warn).toContain('c1: the typecheck fails with it: app/consumer.ts:5 TS2322');
    expect(project.errors()).toEqual([]);
  });

  for (const [shape, group, read] of [
    ['a shorthand group', `{ ${NAMES.join(', ')} }`, 'ALL.c4.authenticate'],
    [
      'a group under other keys',
      `{ ${NAMES.map((name) => `K_${name}: ${name}`).join(', ')} }`,
      'ALL.K_c4.authenticate',
    ],
  ]) {
    test(`a member read through ${shape}: only that config is left`, async () => {
      using project = Project.create({
        files: {
          'routes.ts': [
            IMPORT,
            ...EIGHT,
            `export const ALL = ${group};`,
            `export const strategies = ${read};`,
          ],
        },
      });
      using programs = spyOn(TypedRouteContext, 'programs');

      const result = await project.run(['--write']);

      expect(wideIn(project.read('routes.ts'))).toEqual(['c4']);
      expect(result.warn).toContain('c4: the typecheck fails with it: routes.ts:11 TS2339');
      expect(project.errors()).toEqual([]);
      // Traced to the member itself, so no round is spent narrowing.
      expect(programs.mock.calls.length).toBeLessThanOrEqual(5);
    });
  }

  test('two configs that each fail through one statement are both left', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [IMPORT, ...EIGHT, 'export const both = [c2.authenticate, c7.authenticate];'],
      },
    });

    await project.run(['--write']);

    expect(wideIn(project.read('routes.ts'))).toEqual(['c2', 'c7']);
    expect(project.errors()).toEqual([]);
  });

  test('a project that holds no candidate is typechecked once, not each round', async () => {
    using project = Project.create({
      files: {
        'lib/routes.ts': [IMPORT, ...EIGHT, 'export const strategies = c1.authenticate;'],
        'other/plain.ts': ['export const plain = 1;'],
      },
      projects: ['lib', 'other'],
    });
    using programs = spyOn(BindingKeysCommand, 'createProgram');

    await project.run(['--write']);

    const roots = programs.mock.calls.map(([opts]) => opts.root);

    expect(roots.filter((root) => root.endsWith('other'))).toHaveLength(1);
    expect(roots.filter((root) => root.endsWith('lib')).length).toBeGreaterThan(2);
  });

  /** The array comes out of a function declaration, so no binding leads from the failing statement to a config. */
  const HIDDEN = [
    IMPORT,
    ...EIGHT,
    MAKE,
    'function collect() { return [c3, c6]; }',
    'collect().push(make());',
  ];

  test('an error that leads to no config is narrowed down by halves', async () => {
    using project = Project.create({
      files: { 'routes.ts': HIDDEN },
    });
    using programs = spyOn(TypedRouteContext, 'programs');

    const result = await project.run(['--write']);

    // One of the two kept wide widens the array, which is enough for the push.
    expect(wideIn(project.read('routes.ts'))).toEqual(['c6']);
    expect(result.warn).toContain('c6: the typecheck fails with it: routes.ts:12 TS2345');
    expect(project.errors()).toEqual([]);
    expect(programs.mock.calls.length).toBeLessThanOrEqual(11);
  });

  test('the typecheck rounds are bounded, and what was not tried is listed', () => {
    using project = Project.create({
      files: { 'routes.ts': HIDDEN },
    });
    const file = join(project.root, 'routes.ts');
    const source = project.read('routes.ts');
    let rounds = 0;

    const proof = SatisfiesRewrite.prove({
      typescript: ts,
      root: project.root,
      sources: new Map([[file, source]]),
      candidates: SatisfiesRewrite.scan({ typescript: ts, fileName: file, source }).candidates,
      programs: (contents) => {
        rounds += 1;

        return TypedRouteContext.programs({
          typescript: ts,
          root: project.root,
          files: [file],
          contents,
        }).map(({ program }) => program);
      },
      roundLimit: 3,
    });

    // The text as it was, then the three rounds.
    expect(rounds).toBe(4);
    expect(proof.accepted.length).toBeGreaterThan(0);
    expect(proof.accepted.length + proof.left.length).toBe(8);
    expect(proof.left.map((item) => item.reason)).toContain(
      'not tried: the codemod stops after 3 typecheck rounds; run it again after writing the others',
    );
  });
});

describe('devz codemod typed-route-context: what it reports', () => {
  test('the exported configs it rewrites are counted', async () => {
    using project = Project.create({
      files: {
        'routes.ts': [
          IMPORT,
          `export const one: IAuthRouteConfig = ${LITERAL};`,
          `const two: IAuthRouteConfig = ${LITERAL};`,
          `const local: IAuthRouteConfig = ${LITERAL};`,
          `export class Statics { static readonly A: IAuthRouteConfig = ${LITERAL}; }`,
          `export const members = { A: ${LITERAL} as IAuthRouteConfig, B: ${LITERAL} as IAuthRouteConfig };`,
          `export const build = () => { const inner: IAuthRouteConfig = ${LITERAL}; return inner; };`,
          'export { two };',
          'export const read = local.path;',
        ],
      },
    });

    const dry = await project.run([]);
    const written = await project.run(['--write']);

    expect(dry.log).toContain(
      '4 exported config(s) would be rewritten: typecheck their importers outside this run',
    );
    expect(written.log).toContain(
      '4 exported config(s) rewritten: typecheck their importers outside this run',
    );
    const result2 = await project.run([]);
    expect(result2.log).not.toContain('exported config');
  });

  for (const declaration of [
    `export const a: import('@venizia/ignis').IAuthRouteConfig = ${LITERAL};`,
    `export const a: Record<string, import('@venizia/ignis').IAuthRouteConfig> = ${RECORD};`,
    `export const a = ${LITERAL} as import('@venizia/ignis').IAuthRouteConfig;`,
  ]) {
    test(`a config typed through import() is listed: ${declaration}`, async () => {
      using project = Project.create({ files: { 'routes.ts': [declaration] } });

      const result = await project.run(['--write']);

      expect(result.warn).toContain('routes.ts:1  a: typed through import()');
      expect(project.read('routes.ts')).toBe(declaration);
    });
  }
});

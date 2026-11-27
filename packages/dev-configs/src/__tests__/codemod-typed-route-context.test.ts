import { describe, expect, spyOn, test } from 'bun:test';
import ts from 'typescript';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodemodCommand } from '../cli/codemod';
import { TypedRouteContext } from '../cli/codemod/typed-route-context';
import { CliOutput } from '../common/cli-output';

const rewrite = (lines: string[]) =>
  TypedRouteContext.rewrite({
    typescript: ts,
    fileName: 'controller.ts',
    source: lines.join('\n'),
  });

const IMPORT = `import { post, type TRouteContext } from '@venizia/ignis';`;
const ROUTES = `import { Routes } from './routes';`;

describe('devz codemod typed-route-context: decorated methods', () => {
  test('the context takes the route type, valid() loses its type argument, the import follows', () => {
    const result = rewrite([
      IMPORT,
      ROUTES,
      'class C {',
      '  @post({ configs: Routes.CREATE })',
      '  create(context: TRouteContext) {',
      `    return context.req.valid<{ a: string }>('json');`,
      '  }',
      `  @post({ configs: Routes['UPDATE'] })`,
      '  update(opts: { context: TRouteContext<AppEnv, Body> }) {',
      '    const { context } = opts;',
      `    return [opts.context.req.valid<A>('param'), context.req.valid<B[]>('query')];`,
      '  }',
      '}',
    ]);

    expect(result.output).toBe(
      [
        `import { post, type TContextOf } from '@venizia/ignis';`,
        ROUTES,
        'class C {',
        '  @post({ configs: Routes.CREATE })',
        '  create(context: TContextOf<typeof Routes.CREATE>) {',
        `    return context.req.valid('json');`,
        '  }',
        `  @post({ configs: Routes['UPDATE'] })`,
        '  update(opts: { context: TContextOf<typeof Routes.UPDATE, AppEnv> }) {',
        '    const { context } = opts;',
        `    return [opts.context.req.valid('param'), context.req.valid('query')];`,
        '  }',
        '}',
      ].join('\n'),
    );
  });

  test('a key that is no identifier is read by index', () => {
    const result = rewrite([
      IMPORT,
      ROUTES,
      `class C { @post({ configs: Routes['/create'] }) a(context: TRouteContext) {} }`,
    ]);

    expect(result.output).toContain(`a(context: TContextOf<(typeof Routes)['/create']>)`);
  });

  test('an inline config, a this.* config and a method with no decorator keep their types', () => {
    const source = [
      IMPORT,
      'class C {',
      `  @post({ configs: { path: '/' } })`,
      `  a(context: TRouteContext) { return context.req.valid<A>('json'); }`,
      '  @post({ configs: this.definitions.B })',
      '  b(context: TRouteContext) {}',
      '  override create(opts: { context: TRouteContext }) {}',
      '}',
    ];

    expect(rewrite(source).changed).toBe(false);
  });

  test('the environment argument is kept, whatever it is named', () => {
    const result = rewrite([
      IMPORT,
      ROUTES,
      'class C { @post({ configs: Routes.A }) a(context: TRouteContext<Env>) {} }',
    ]);

    expect(result.output).toContain('a(context: TContextOf<typeof Routes.A, Env>)');
  });

  test('the import stays while a shortened TRouteContext still reads it', () => {
    const result = rewrite([
      IMPORT,
      ROUTES,
      'class C { @post({ configs: Routes.A }) a(context: TRouteContext) {} }',
      'const helper = (c: TRouteContext<AppEnv, TSale>) => c;',
    ]);

    expect(result.output).toContain(
      `import { post, type TRouteContext, type TContextOf } from '@venizia/ignis';`,
    );
    expect(result.output).toContain('const helper = (c: TRouteContext<AppEnv>) => c;');
  });

  for (const declaration of [
    'const WIDE: IAuthRouteConfig = { path };',
    'const WIDE: Record<string, IAuthRouteConfig> = { A: { path } };',
    'const WIDE = { A: { path } } as Record<string, IAuthRouteConfig>;',
    'class WIDE { static readonly A: IAuthRouteConfig = { path }; }',
    'const WIDE: Readonly<Record<string, IAuthRouteConfig>> = { A: { path } };',
    'const WIDE = { A: { path } as IAuthRouteConfig };',
    "const WIDE = { 'A': { path } as Omit<IAuthRouteConfig, 'method'> };",
  ]) {
    test(`a handler of a config declared wide is left alone: ${declaration}`, () => {
      const source = [
        IMPORT,
        declaration,
        'class C {',
        `  @post({ configs: WIDE.A }) a(context: TRouteContext) { context.req.valid<B>('json'); }`,
        '}',
      ];

      expect(rewrite(source).changed).toBe(false);
    });
  }

  test('a method that is not private is left alone when only a route forwards to it', () => {
    const source = [
      IMPORT,
      ROUTES,
      'class C {',
      '  binding() { this.defineRoute({ configs: Routes.A, handler: (context) => this.run(context) }); }',
      '  run(context: TRouteContext) {}',
      '}',
    ];

    expect(rewrite(source).changed).toBe(false);
  });

  test('a type of the same name from another package is left alone', () => {
    const source = [
      `import type { TRouteContext } from './own';`,
      'class C { @post({ configs: R }) a(context: TRouteContext<E, B>) {} }',
    ];

    expect(rewrite(source).changed).toBe(false);
  });
});

describe('devz codemod typed-route-context: forwarded handlers', () => {
  test('a method one route forwards to is typed', () => {
    const result = rewrite([
      `import type { TRouteContext } from '@venizia/ignis-kernel';`,
      ROUTES,
      'class C {',
      '  binding() {',
      '    this.defineRoute({ configs: Routes.A, handler: (context) => this.runA({ context }) });',
      '    this.bindRoute({ configs: Routes.B }).to({ handler: (c) => { return this.runB(c); } });',
      '  }',
      `  private runA(opts: { context: TRouteContext }) { opts.context.req.valid<A>('json'); }`,
      '  private runB(context: TRouteContext) {}',
      '}',
    ]);

    expect(result.output).toContain(`import type { TContextOf } from '@venizia/ignis-kernel';`);
    expect(result.output).toContain(
      `runA(opts: { context: TContextOf<typeof Routes.A> }) { opts.context.req.valid('json'); }`,
    );
    expect(result.output).toContain('runB(context: TContextOf<typeof Routes.B>)');
  });

  test('a method two routes share, or one also called another way, is left alone', () => {
    const source = [
      IMPORT,
      ROUTES,
      'class C {',
      '  binding() {',
      '    this.defineRoute({ configs: Routes.A, handler: (context) => this.shared(context) });',
      '    this.defineRoute({ configs: Routes.B, handler: (context) => this.shared(context) });',
      '    this.defineRoute({ configs: Routes.C, handler: (context) => this.again(context) });',
      '  }',
      '  other(context: TRouteContext) { return this.again(context); }',
      '  private shared(context: TRouteContext) {}',
      '  private again(context: TRouteContext) {}',
      '}',
    ];

    expect(rewrite(source).changed).toBe(false);
  });
});

describe('devz codemod typed-route-context: the removed type arguments', () => {
  test('the second argument of TRouteContext and the response of TRouteHandler go', () => {
    const result = rewrite([
      `import type { TRouteContext, TRouteHandler } from '@venizia/ignis';`,
      'const a = (context: TRouteContext<E, Body>) => context;',
      'let b: TRouteHandler<Body, E>;',
    ]);

    expect(result.output).toBe(
      [
        `import type { TRouteContext, TRouteHandler } from '@venizia/ignis';`,
        'const a = (context: TRouteContext<E>) => context;',
        'let b: TRouteHandler<E>;',
      ].join('\n'),
    );
  });

  test('a second run changes nothing', () => {
    const first = rewrite([
      IMPORT,
      ROUTES,
      'class C { @post({ configs: Routes.A }) a(context: TRouteContext<E, B>) {} }',
    ]);
    const second = rewrite([first.output]);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
  });
});

describe('devz codemod typed-route-context: what the body argument checked stays checked', () => {
  const HEAD = "import type { TJsonResponse, TRouteContext, TRouteHandler } from '@venizia/ignis';";

  test('json() takes satisfies, and the return type no longer names the body', () => {
    const result = rewrite([
      HEAD,
      "import type { TSale } from './sale';",
      'class C {',
      '  private async find(opts: { context: TRouteContext<AppEnv, TSale> }): Promise<TJsonResponse<TSale, 200>> {',
      '    const { context } = opts;',
      '    if (x) { return context.json(row ?? fallback, 200); }',
      '    return opts.context.json({ ...row, total: 1 }, 200);',
      '  }',
      '}',
    ]);

    expect(result.output).toContain(
      'opts: { context: TRouteContext<AppEnv> }): Promise<TJsonResponse<unknown, 200>> {',
    );
    expect(result.output).toContain('return context.json((row ?? fallback) satisfies TSale, 200);');
    expect(result.output).toContain(
      'return opts.context.json({ ...row, total: 1 } satisfies TSale, 200);',
    );
    expect(result.output).toContain("import type { TSale } from './sale';");
  });

  test('a TRouteHandler that named the response checks it in its json()', () => {
    const result = rewrite([HEAD, 'const h: TRouteHandler<TSale, AppEnv> = (c) => c.json(row);']);

    expect(result.output).toContain(
      'const h: TRouteHandler<AppEnv> = (c) => c.json(row satisfies TSale);',
    );
  });

  test('a typed method keeps the check, and a second run changes nothing', () => {
    const first = rewrite([
      "import { post, type TJsonResponse, type TRouteContext } from '@venizia/ignis';",
      ROUTES,
      'class C {',
      '  @post({ configs: Routes.A })',
      '  a(context: TRouteContext<AppEnv, TSale>): TJsonResponse<TSale> {',
      "    return context.json(context.req.valid<TInput>('json'));",
      '  }',
      '}',
    ]);

    expect(first.output).toContain(
      'a(context: TContextOf<typeof Routes.A, AppEnv>): TJsonResponse<unknown> {',
    );
    expect(first.output).toContain(
      "return context.json(context.req.valid('json') satisfies TSale);",
    );
    expect(rewrite([first.output]).changed).toBe(false);
  });

  test('a context that named no body, or unknown, is left without satisfies', () => {
    const result = rewrite([
      HEAD,
      'const a = (c: TRouteContext<AppEnv, unknown>) => c.json(row);',
      'const b = (c: TRouteContext<AppEnv>) => c.json(row);',
    ]);

    expect(result.output).not.toContain('satisfies');
  });
});

describe('devz codemod typed-route-context: what the rewrite leaves unused', () => {
  test('an import and a local type read only by what was dropped go; the rest stays', () => {
    const result = rewrite([
      'import {',
      '  post,',
      '  type TInferSchema,',
      '  type TRouteContext,',
      "} from '@venizia/ignis';",
      "import type { TSale } from './sale';",
      "import type { TOrder, TUnread } from './order';",
      "import { CreateSchema, Routes } from './routes';",
      'type TCreate = TInferSchema<typeof CreateSchema>;',
      'type TLine = { sku: string };',
      'type TBody = { lines: TLine[] };',
      'export type TShared = { id: string };',
      'class C {',
      '  @post({ configs: Routes.A })',
      '  a(context: TRouteContext<AppEnv, TSale>) {',
      "    return [context.req.valid<TCreate>('json'), context.req.valid<TBody>('query'), context.req.valid<TShared>('param')];",
      '  }',
      '  keep(order: TOrder) { return order; }',
      '}',
    ]);

    expect(result.output).toBe(
      [
        'import {',
        '  post,',
        '  type TContextOf,',
        "} from '@venizia/ignis';",
        "import type { TOrder, TUnread } from './order';",
        "import { Routes } from './routes';",
        'export type TShared = { id: string };',
        'class C {',
        '  @post({ configs: Routes.A })',
        '  a(context: TContextOf<typeof Routes.A, AppEnv>) {',
        "    return [context.req.valid('json'), context.req.valid('query'), context.req.valid('param')];",
        '  }',
        '  keep(order: TOrder) { return order; }',
        '}',
      ].join('\n'),
    );
  });

  test('a dropped body argument leaves no import behind, with no method to type', () => {
    const result = rewrite([
      "import type { TRouteContext } from '@venizia/ignis';",
      "import type { TSale } from './sale';",
      'const helper = (c: TRouteContext<AppEnv, TSale>) => c;',
    ]);

    expect(result.output).toBe(
      [
        "import type { TRouteContext } from '@venizia/ignis';",
        'const helper = (c: TRouteContext<AppEnv>) => c;',
      ].join('\n'),
    );
  });
});

/** The types the command asks: `valid()` answers the config's `body`, and `unknown` for a config that holds none. */
const FRAMEWORK = `export type TRouteContext = TContextOf<object>;
export type TContextOf<C extends object, E = unknown> = {
  req: {
    valid<K extends string>(target: K): C extends { body: infer B } ? B : unknown;
    valid<T = unknown>(target: string): T;
  };
};
export declare const post: (opts: { configs: object }) => MethodDecorator;
`;

describe('devz codemod typed-route-context: a config that carries no schema type', () => {
  test('its valid() keeps the type argument, as one whose method then fails to type-check does; the rest lose both', async () => {
    const root = mkdtempSync(join(tmpdir(), 'typed-route-'));

    const write = (path: string, lines: string[]) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), lines.join('\n'));
    };

    write('node_modules/@venizia/ignis/package.json', [
      JSON.stringify({ name: '@venizia/ignis', types: 'index.d.ts' }),
    ]);
    write('node_modules/@venizia/ignis/index.d.ts', [FRAMEWORK]);
    write('tsconfig.json', [
      JSON.stringify({ compilerOptions: { experimentalDecorators: true, strict: true } }),
    ]);
    write('routes.ts', [
      'export const Typed = { body: { name: 1 } };',
      'export const Wide: { path?: string } = {};',
    ]);
    write('types.ts', [
      'export type TTyped = { name: number };',
      'export type TWide = { id: string };',
    ]);
    write('controller.ts', [
      "import { post, type TRouteContext } from '@venizia/ignis';",
      "import { Typed, Wide } from './routes';",
      "import type { TOwn, TTyped, TWide } from './types';",
      'export class C {',
      '  @post({ configs: Typed })',
      "  a(context: TRouteContext): number { return context.req.valid<TTyped>('json').name; }",
      '  @post({ configs: Wide })',
      "  b(context: TRouteContext): string { return context.req.valid<TWide>('json').id; }",
      '  @post({ configs: Typed })',
      "  c(context: TRouteContext): string { return context.req.valid<TOwn>('json').name; }",
      '  d(): string { return 1; }',
      '}',
    ]);
    using warn = spyOn(CliOutput, 'warn').mockImplementation(() => {});
    using _log = spyOn(CliOutput, 'log').mockImplementation(() => {});

    const code = await CodemodCommand.run({
      root,
      args: ['typed-route-context', 'controller.ts', '--write'],
    });
    const output = readFileSync(join(root, 'controller.ts'), 'utf8');
    rmSync(root, { recursive: true, force: true });

    expect(code).toBe(0);
    expect(output).toContain("return context.req.valid('json').name;");
    expect(output).toContain("return context.req.valid<TWide>('json').id;");
    expect(output).toContain("return context.req.valid<TOwn>('json').name;");
    expect(output).toContain("import type { TOwn, TWide } from './types';");
    expect(warn.mock.calls.flat().join('\n')).toContain('2 valid<T>() type argument(s)');
    // What `c` still gets wrong with its argument kept is not the codemod's to fix, and it says where.
    expect(warn.mock.calls.flat().join('\n')).toMatch(
      /check by hand {2}controller\.ts:\d+ {2}TS2322/,
    );
  });
});

describe('devz codemod typed-route-context: the text around what it removes', () => {
  const method = [
    'class C {',
    '  @post({ configs: Routes.A })',
    "  a(context: TRouteContext) { return context.req.valid<TFirst>('json'); }",
    '}',
  ];

  test("a comment that is not the removed type's own stays; its JSDoc goes with it", () => {
    const result = rewrite([
      '// License header',
      '/* eslint-disable no-console */',
      IMPORT,
      ROUTES,
      '',
      '// ---- section ----',
      '/** The body. */',
      'type TFirst = { a: string };',
      ...method,
    ]);

    expect(result.output).toStartWith('// License header\n/* eslint-disable no-console */\n');
    expect(result.output).toContain('// ---- section ----\nclass C {');
    expect(result.output).not.toContain('The body.');
    expect(result.output).not.toContain('TFirst');
  });

  test('a default import is left without empty braces', () => {
    const result = rewrite([
      IMPORT,
      ROUTES,
      "import extra, { type TFirst } from './extra';",
      ...method,
      'extra();',
    ]);

    expect(result.output).toContain("import extra from './extra';");
  });

  test('a CRLF file keeps its line breaks, and a whole import leaves no blank line', () => {
    const source = [
      'import {',
      '  post,',
      '  type TRouteContext,',
      "} from '@venizia/ignis';",
      ROUTES,
      "import type { TFirst } from './first';",
      ...method,
    ].join('\r\n');
    const result = TypedRouteContext.rewrite({
      typescript: ts,
      fileName: 'controller.ts',
      source,
    });

    expect(result.output.split('\r\n').join('')).not.toContain('\n');
    expect(result.output).toContain(`${ROUTES}\r\nclass C {`);
  });

  test('json() of spread arguments takes no satisfies', () => {
    const result = rewrite([
      "import type { TRouteContext } from '@venizia/ignis';",
      'const a = (c: TRouteContext<AppEnv, TSale>) => c.json(...rest);',
    ]);

    expect(result.output).toContain('c.json(...rest);');
  });
});

describe('devz codemod typed-route-context: a type only the project declares', () => {
  test('a global type of the tsconfig is read, so no argument is kept for it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'typed-route-global-'));

    const write = (path: string, lines: string[]) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), lines.join('\n'));
    };

    write('node_modules/@venizia/ignis/package.json', [
      JSON.stringify({ name: '@venizia/ignis', types: 'index.d.ts' }),
    ]);
    write('node_modules/@venizia/ignis/index.d.ts', [FRAMEWORK]);
    write('tsconfig.json', [
      JSON.stringify({
        compilerOptions: { experimentalDecorators: true, strict: true },
        include: ['*.ts', 'types'],
      }),
    ]);
    write('types/global.d.ts', ['type AppEnv = { name: string };']);
    write('routes.ts', ['export const Typed = { body: { name: 1 } };']);
    write('controller.ts', [
      "import { post, type TRouteContext } from '@venizia/ignis';",
      "import { Typed } from './routes';",
      'export class C {',
      '  @post({ configs: Typed })',
      "  a(context: TRouteContext<AppEnv>): number { return context.req.valid<{ name: number }>('json').name; }",
      '}',
    ]);
    using warn = spyOn(CliOutput, 'warn').mockImplementation(() => {});
    using _log = spyOn(CliOutput, 'log').mockImplementation(() => {});

    await CodemodCommand.run({ root, args: ['typed-route-context', 'controller.ts', '--write'] });
    const output = readFileSync(join(root, 'controller.ts'), 'utf8');
    rmSync(root, { recursive: true, force: true });

    expect(output).toContain("context.req.valid('json').name;");
    expect(warn.mock.calls).toHaveLength(0);
  });
});

describe('devz codemod typed-route-context: the command', () => {
  test('it is listed, and it is not reversible', async () => {
    using log = spyOn(CliOutput, 'log').mockImplementation(() => {});
    using error = spyOn(CliOutput, 'error').mockImplementation(() => {});
    await CodemodCommand.run({ root: '.', args: ['--list'] });
    const code = await CodemodCommand.run({
      root: '.',
      args: ['typed-route-context', '--reverse'],
    });

    const listed = log.mock.calls.flatMap(([text]) => String(text).split('\n'));

    expect(listed).toContain('typed-route-context');
    expect(code).toBe(2);
    expect(error.mock.calls).toHaveLength(1);
  });
});

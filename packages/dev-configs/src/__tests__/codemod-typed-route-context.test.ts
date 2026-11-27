import { describe, expect, spyOn, test } from 'bun:test';
import ts from 'typescript';
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

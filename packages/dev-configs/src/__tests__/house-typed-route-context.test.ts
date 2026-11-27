import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  houseConfigs,
  houseEslintPlugin,
  reactHouseConfigs,
  TypedRouteContextRule,
} from '../linters/house';

const NAME = TypedRouteContextRule.NAME;

const lint = (code: string) =>
  new Linter({ configType: 'flat' })
    .verify(
      code,
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslint.parser },
          plugins: { '@venizia': houseEslintPlugin },
          rules: { [NAME]: TypedRouteContextRule.build() },
        },
      ],
      'controller.ts',
    )
    .map((message) => message.messageId ?? message.message);

describe('typed-route-context: a config declared wide', () => {
  test('a variable, an Omit, a Record and a class property are reported', () => {
    expect(
      lint(`
        const a: IAuthRouteConfig = { path: '/' };
        const b: Omit<IAuthRouteConfig, 'method'> = { path: '/' };
        const c: Record<string, IAuthRouteConfig> = { d: { path: '/' } };
        class Routes { static readonly E: IAuthRouteConfig = { path: '/' }; }
        const f: Record<string, IAuthRouteConfig> = { g: { path: '/' } } as const;
      `),
    ).toEqual(['wideConfig', 'wideConfig', 'wideConfig', 'wideConfig', 'wideConfig']);
  });

  test('an empty object filled later is left alone', () => {
    expect(lint('const routes: Record<string, IAuthRouteConfig> = {};')).toEqual([]);
  });

  test('satisfies, a parameter and a value that is not an object literal are left alone', () => {
    expect(
      lint(`
        const a = { path: '/' } satisfies IAuthRouteConfig;
        const b: IAuthRouteConfig = build();
        const c = (config: IAuthRouteConfig = { path: '/' }) => config;
      `),
    ).toEqual([]);
  });
});

describe('typed-route-context: valid() with a type argument', () => {
  test('is reported on an annotated context, in its options and after a destructuring', () => {
    expect(
      lint(`
        const a = (context: TContextOf<typeof A>) => context.req.valid<B>('json');
        const b = (opts: { context: TContextOf<typeof A> }) => opts.context.req.valid<B>('json');
        const c = (opts: { context: TContextOf<typeof A> }) => {
          const { context } = opts;
          return context.req.valid<B>('json');
        };
        const d = ({ context }: { context: TContextOf<typeof A> }) => context.req.valid<B>('json');
      `),
    ).toEqual(['typedValid', 'typedValid', 'typedValid', 'typedValid']);
  });

  test('is reported in an unannotated defineRoute, defineJSXRoute and bindRoute handler', () => {
    expect(
      lint(`
        this.defineRoute({ configs: A, handler: (context) => context.req.valid<B>('json') });
        this.defineJSXRoute({ configs: A, handler: (c) => c.req.valid<B>('query') });
        this.bindRoute({ configs: A }).to({ handler: (context) => context.req.valid<B>('json') });
      `),
    ).toEqual(['typedValid', 'typedValid', 'typedValid']);
  });

  test('is left alone on a context that is not typed from a route, and without a type argument', () => {
    expect(
      lint(`
        const a = (context: TRouteContext) => context.req.valid<B>('json');
        const b = (context: TContextOf<typeof A>) => context.req.valid('json');
        const c = (context: TContextOf<typeof A>) => (context: TContext) => context.req.valid<B>('json');
        other.define({ handler: (context) => context.req.valid<B>('json') });
      `),
    ).toEqual([]);
  });
});

describe('typed-route-context: another route', () => {
  test('a decorated method typed from another config is reported', () => {
    expect(
      lint(`
        class C {
          @post({ configs: Routes.CREATE })
          create(context: TContextOf<typeof Routes.UPDATE>) {}
        }
      `),
    ).toEqual(['otherRoute']);
  });

  test('the same config, written dotted or indexed, and an inline config are left alone', () => {
    expect(
      lint(`
        class C {
          @post({ configs: Routes.CREATE })
          create(context: TContextOf<typeof Routes.CREATE>) {}
          @get({ configs: Routes['FIND'] })
          find(context: TContextOf<(typeof Routes)['FIND']>) {}
          @del({ configs: { path: '/' } })
          remove(context: TContextOf<typeof Routes.REMOVE>) {}
        }
      `),
    ).toEqual([]);
  });

  test('a handler forwarding to a method of another route is reported, defineRoute and bindRoute alike', () => {
    expect(
      lint(`
        class C {
          binding() {
            this.defineRoute({ configs: Routes.A, handler: (context) => this.runB({ context }) });
            this.bindRoute({ configs: Routes.A }).to({
              handler: async (context) => {
                return await this.runB({ context: context });
              },
            });
          }
          private runB(opts: { context: TContextOf<typeof Routes.B> }) {}
        }
      `),
    ).toEqual(['forwarded', 'forwarded']);
  });

  test('a forward to the method of its own route, or to a method elsewhere, is left alone', () => {
    expect(
      lint(`
        class C {
          binding() {
            this.defineRoute({ configs: Routes.A, handler: (context) => this.runA({ context }) });
            this.defineRoute({ configs: Routes.A, handler: (context) => this.elsewhere(context) });
            this.defineRoute({ configs: Routes.A, handler: (context) => this.runB(context.req) });
          }
          private runA(opts: { context: TContextOf<typeof Routes.A> }) {}
          private runB(request: unknown) {}
        }
      `),
    ).toEqual([]);
  });
});

describe('typed-route-context: the presets', () => {
  test('both presets turn it on as an error', () => {
    for (const preset of [houseConfigs, reactHouseConfigs]) {
      const levels = preset.map((config) => config.rules?.[NAME]).filter(Boolean);

      expect(levels).toEqual([['error']]);
    }
  });
});

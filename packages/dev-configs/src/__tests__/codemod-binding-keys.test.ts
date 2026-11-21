import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { BindingKeysCodemod } from '../cli/codemod/binding-keys';

const CONTAINER_METHODS = `
  get<T>(opts: { key: string | { namespace: string; key: string }; isOptional?: boolean }): T;
  gets<T extends unknown[]>(opts: { bindings: Array<{ key: string; isOptional?: boolean }> }): T;
  getBinding<T>(opts: { key: string | { namespace: string; key: string } }): Binding<T> | undefined;
  bind<T>(opts: { key: string }): Binding<T>;
  isBound(opts: { key: string }): boolean;
  unbind(opts: { key: string }): boolean;
`;

/** A stand-in for the framework package: its declarations live under node_modules/@venizia/ignis, which is where the codemod looks. */
const FRAMEWORK_STUB = `
export declare class Binding<T = unknown> { key: string; static bind<T>(opts: { key: string }): Binding<T>; }
export interface IContainer {${CONTAINER_METHODS}}
export declare class Container implements IContainer {${CONTAINER_METHODS}}
export declare const inject: (opts: { key?: string; target?: unknown; isOptional?: boolean }) => (target: object, name: string | symbol | undefined, index?: number) => void;
export declare const provide: (opts: { key: string; scope?: string }) => (target: object, name: string | symbol) => void;
export declare class BindingKeys { static build<T>(opts: { namespace?: string; key: string }): string & { valueType: T }; }
`;

const VIRTUAL_FILES = new Map<string, string>([
  ['/virtual/src/file.ts', ''],
  ['/virtual/node_modules/@venizia/ignis/index.d.ts', FRAMEWORK_STUB],
  ['/virtual/src/thing.d.ts', 'export declare const thing: number;'],
]);

/** A program over `source` and the stub framework: the checker answers what `a` is, as it does in a project. */
const programOf = (source: string, fileName: string) => {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    experimentalDecorators: true,
    noLib: true,
    noEmit: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const files = new Map(VIRTUAL_FILES).set(fileName, source);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (name) => files.has(name);
  host.readFile = (name) => files.get(name);

  host.getSourceFile = (name, languageVersion, ...rest) => {
    const text = files.get(name);

    return text === undefined
      ? originalGetSourceFile(name, languageVersion, ...rest)
      : ts.createSourceFile(name, text, languageVersion, true);
  };

  host.resolveModuleNames = (names) =>
    names.map((name) => {
      if (name.startsWith('@venizia/') || name === './container') {
        return {
          resolvedFileName: '/virtual/node_modules/@venizia/ignis/index.d.ts',
          extension: ts.Extension.Dts,
        };
      }

      return name === './thing'
        ? { resolvedFileName: '/virtual/src/thing.d.ts', extension: ts.Extension.Dts }
        : undefined;
    });

  const program = ts.createProgram({ rootNames: [fileName], options, host });
  const sourceFile = program.getSourceFile(fileName);

  if (sourceFile === undefined) {
    throw new Error('the virtual file is missing from the program');
  }

  return { sourceFile, checker: program.getTypeChecker() };
};

const PACKAGES = new Map<string, string>([
  ['/virtual/node_modules/@venizia/ignis/package.json', '{"name":"@venizia/ignis"}'],
  ['/virtual/package.json', '{"name":"app"}'],
  ['/virtual/fx/packages/kernel/package.json', '{"name":"fx-kernel"}'],
]);

const rewrite = (source: string, importFrom?: string, fileName = '/virtual/src/file.ts') =>
  BindingKeysCodemod.rewrite({
    typescript: ts,
    fileName,
    source,
    importFrom,
    program: programOf(source, fileName),
    readFile: (path) => PACKAGES.get(path),
  });

/** What a snippet needs to be about the container: the framework's names and a few receivers, on one line so line numbers stay the snippet's. */
const PRELUDE =
  "import { inject, provide, Binding, Container } from '@venizia/ignis'; declare const a: Container; declare const container: Container; declare const app: Container; declare const application: Container; declare const redis: { get<T>(opts: { key: string }): Promise<string | null> }; declare const workerPool: { get<T>(opts: { key: string }): T }; declare const loose: any; interface Mailer {} interface A {} interface B {} /*@*/ ";

/** The rewrite of `snippet` after the prelude; the prelude (and the import it gained) is left out of the answer. */
const body = (snippet: string) => {
  const result = rewrite(`${PRELUDE}${snippet}`);
  const mark = result.output.indexOf('/*@*/ ');

  return { ...result, output: mark === -1 ? result.output : result.output.slice(mark + 6) };
};

describe('devz codemod binding-keys: the rewrite', () => {
  test('a string key becomes build<unknown>, and the site is listed to name its type', () => {
    const result = body(`container.bind({ key: 'services.Mailer' });\n`);

    expect(result.output).toBe(
      `container.bind({ key: BindingKeys.build<unknown>({ key: 'services.Mailer' }) });\n`,
    );
    expect(result.rewritten).toBe(1);
    expect(result.unnamed).toEqual([1]);
    expect(result.manual).toEqual([]);
  });

  test("the call's own type argument moves into build<T> and the site is not listed", () => {
    const result = body(
      `const a = app.get<Mailer>({ key: 'services.Mailer' });\nconst b = app.bind<Mailer>({ key: "services.Mailer" });\n`,
    );

    expect(result.output).toBe(
      [
        `const a = app.get({ key: BindingKeys.build<Mailer>({ key: 'services.Mailer' }) });`,
        `const b = app.bind({ key: BindingKeys.build<Mailer>({ key: "services.Mailer" }) });`,
        '',
      ].join('\n'),
    );
    expect(result.unnamed).toEqual([]);
  });

  test('isOptional stays, and every method of the container is covered', () => {
    const result = body(
      [
        `a.get<A>({ key: 'a.A', isOptional: true });`,
        `a.getBinding({ key: 'a.A' });`,
        `a.isBound({ key: 'a.A' });`,
        `a.unbind({ key: 'a.A' });`,
        `Binding.bind<A>({ key: 'a.A' });`,
        '',
      ].join('\n'),
    );

    expect(result.rewritten).toBe(5);
    expect(result.output).toContain(
      `a.get({ key: BindingKeys.build<A>({ key: 'a.A' }), isOptional: true });`,
    );
    expect(result.output).toContain(`Binding.bind({ key: BindingKeys.build<A>({ key: 'a.A' }) });`);
  });

  test('a template literal without substitutions is a string key', () => {
    const result = body('container.isBound({ key: `services.Mailer` });\n');

    expect(result.output).toContain('BindingKeys.build<unknown>({ key: `services.Mailer` })');
  });

  test('@inject, on a parameter and on a property', () => {
    const result = body(
      [
        `class A {`,
        `  @inject({ key: 'services.Mailer' }) mailer: Mailer;`,
        `  constructor(@inject({ key: 'services.Clock', isOptional: true }) clock: Clock) {}`,
        `}`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(
      `@inject({ key: BindingKeys.build<Mailer>({ key: 'services.Mailer' }) })`,
    );
    expect(result.output).toContain(
      `@inject({ key: BindingKeys.build<Clock>({ key: 'services.Clock' }), isOptional: true })`,
    );
    expect(result.rewritten).toBe(2);
  });

  test('a { namespace, key } literal becomes build({ namespace, key }) with the call type', () => {
    const result = body(
      `a.get<Repo>({ key: { namespace: BindingNamespaces.REPOSITORY, key: UserRepository.name } });\n`,
    );

    expect(result.output).toBe(
      `a.get({ key: BindingKeys.build<Repo>({ namespace: BindingNamespaces.REPOSITORY, key: UserRepository.name }) });\n`,
    );
  });

  test('gets: each key of the bindings list', () => {
    const result = body(
      `a.gets({ bindings: [{ key: 'a.A' }, { key: 'b.B', isOptional: true }] });\n`,
    );

    expect(result.rewritten).toBe(2);
    expect(result.output).toContain(`{ key: BindingKeys.build<unknown>({ key: 'a.A' }) }`);
  });

  test('a build without a type argument gets build<unknown> and is listed', () => {
    const result = body(`const key = BindingKeys.build({ namespace: 'services', key: 'X' });\n`);

    expect(result.output).toBe(
      `const key = BindingKeys.build<unknown>({ namespace: 'services', key: 'X' });\n`,
    );
    expect(result.unnamed).toEqual([1]);
  });

  test("a build in a call's key takes the call's type argument, once", () => {
    const result = body(`a.get<Mailer>({ key: BindingKeys.build({ key: 'services.Mailer' }) });\n`);

    expect(result.output).toBe(
      `a.get({ key: BindingKeys.build<Mailer>({ key: 'services.Mailer' }) });\n`,
    );
    expect(result.rewritten).toBe(1);
  });

  test('a key made at run time, and a Symbol key, are listed as manual and left alone; a name is not listed', () => {
    const result = body(
      [
        `a.get({ key: someKey });`,
        `a.get({ key: Keys.MAILER });`,
        `a.bind({ key: Symbol('x') });`,
        `a.bind({ key: Symbol.for('x') });`,
        `a.get({ key: \`services.\${name}\` });`,
        `a.get({ key: makeKey() });`,
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.manual.map((item) => item.line)).toEqual([3, 4, 5, 6]);
    expect(result.manual[0].reason).toContain('Symbol');
  });

  test('a call that is not a key options object is left alone', () => {
    const result = body(
      [
        `map.get('a.A');`,
        `a.get({ key: 'a.A', other: 1 });`,
        `a.get({ target: Mailer });`,
        `inject({ target: Mailer });`,
        `other({ key: 'a.A' });`,
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.manual).toEqual([]);
  });

  test('a key held in a const of the file is built where it is declared, once, and the use sites are not edited', () => {
    const result = body(
      [
        `const MAILER = 'services.Mailer';`,
        `a.get<Mailer>({ key: MAILER });`,
        `a.bind({ key: MAILER });`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `const MAILER = BindingKeys.build<Mailer>({ key: 'services.Mailer' });`,
        `a.get<Mailer>({ key: MAILER });`,
        `a.bind({ key: MAILER });`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(1);
  });

  test('two consts of one name in different blocks are each built from their own use', () => {
    const result = body(
      [
        `{ const K = 'a.A'; a.bind<A>({ key: K }); }`,
        `{ const K = 'b.B'; a.bind<B>({ key: K }); }`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(`const K = BindingKeys.build<A>({ key: 'a.A' });`);
    expect(result.output).toContain(`const K = BindingKeys.build<B>({ key: 'b.B' });`);
  });

  test('a readonly class property is built where it is declared, a use site is not edited', () => {
    const result = body(
      [
        `class Keys { static readonly MAILER = 'services.Mailer'; }`,
        `a.get<Mailer>({ key: Keys.MAILER });`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `class Keys { static readonly MAILER = BindingKeys.build<Mailer>({ key: 'services.Mailer' }); }`,
        `a.get<Mailer>({ key: Keys.MAILER });`,
        '',
      ].join('\n'),
    );
    expect(result.manual).toEqual([]);
    expect(result.unnamed).toEqual([]);
  });

  test('a property of an `as const` object map is built, a plain object literal is left manual', () => {
    const result = body(
      [
        `const KEYS = { mailer: 'services.Mailer', clock: 'app.Clock' } as const;`,
        `const LOOSE = { mailer: 'services.Mailer' };`,
        `a.get<Mailer>({ key: KEYS.mailer });`,
        `a.get<Mailer>({ key: LOOSE.mailer });`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(
      `{ mailer: BindingKeys.build<Mailer>({ key: 'services.Mailer' }), clock: 'app.Clock' } as const`,
    );
    expect(result.output).toContain(`const LOOSE = { mailer: 'services.Mailer' };`);
    expect(result.manual.map((item) => item.line)).toEqual([4]);
    expect(result.rewritten).toBe(1);
  });

  test('a computed template and a class name are built too', () => {
    const result = body(
      [
        'declare class Mailer { static readonly name: string } declare const NS: string; class Keys { static readonly A = `${NS}.Mailer`; static readonly B = Mailer.name; }',
        `a.get<Mailer>({ key: Keys.A });`,
        `a.get<Mailer>({ key: Keys.B });`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(
      'static readonly A = BindingKeys.build<Mailer>({ key: `${NS}.Mailer` });',
    );
    expect(result.output).toContain(
      'static readonly B = BindingKeys.build<Mailer>({ key: Mailer.name });',
    );
    expect(result.rewritten).toBe(2);
  });

  test('use sites that claim different types give unknown, listed as a type to name', () => {
    const result = body(
      [
        `class Keys { static readonly K = 'a.A'; }`,
        `a.get<A>({ key: Keys.K });`,
        `a.get<B>({ key: Keys.K });`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(
      `static readonly K = BindingKeys.build<unknown>({ key: 'a.A' });`,
    );
    expect(result.unnamed).toEqual([1]);
  });

  test('one type name that means two types at the use sites does not agree', () => {
    const result = body(
      [
        `class Keys { static readonly K = 'a.A'; }`,
        `{ interface Local { x: 1 } a.get<Local>({ key: Keys.K }); }`,
        `{ interface Local { y: 1 } a.get<Local>({ key: Keys.K }); }`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(
      `static readonly K = BindingKeys.build<unknown>({ key: 'a.A' });`,
    );
  });

  test('use sites that agree, or that do not all claim a type, give the claimed one', () => {
    const result = body(
      [
        `class Keys { static readonly K = 'a.A'; }`,
        `a.get<A>({ key: Keys.K });`,
        `a.bind({ key: Keys.K });`,
        `a.get<A>({ key: Keys.K });`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(`static readonly K = BindingKeys.build<A>({ key: 'a.A' });`);
    expect(result.unnamed).toEqual([]);
  });

  test('an annotated, a let, a mutable property and a built key stay as they are', () => {
    const result = body(
      [
        `class Keys { static readonly TYPED: string = 'a.A'; static MUTABLE = 'a.B'; }`,
        `let free = 'a.C';`,
        `a.get<A>({ key: Keys.TYPED });`,
        `a.get<A>({ key: Keys.MUTABLE });`,
        `a.get<A>({ key: free });`,
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.manual.map((item) => item.line)).toEqual([3, 4, 5]);
  });

  test('a template written as ${namespace}.Name or ${namespace}.${name} becomes build({ namespace, key })', () => {
    const result = body(
      [
        'a.isBound({ key: `${NS.SERVICE}.Svc` });',
        'a.get<Probe>({ key: `${NS.SERVICE}.${Probe.name}` });',
        'a.bind({ key: `${prefix}-x` });',
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(
      "a.isBound({ key: BindingKeys.build<unknown>({ namespace: NS.SERVICE, key: 'Svc' }) });",
    );
    expect(result.output).toContain(
      'a.get({ key: BindingKeys.build<Probe>({ namespace: NS.SERVICE, key: Probe.name }) });',
    );
    expect(result.manual.map((item) => item.line)).toEqual([3]);
  });

  test('provide takes a key like inject does, scope included', () => {
    const result = body(`@provide({ key: 'options.alpha', scope: 'transient' }) alpha() {}\n`);

    expect(result.output).toContain(
      "@provide({ key: BindingKeys.build<unknown>({ key: 'options.alpha' }), scope: 'transient' })",
    );
  });

  test('a type that names a type parameter of the enclosing code is listed as manual and left alone', () => {
    const result = body(
      [
        `const read = <T>(name: string) => a.get<T>({ key: { namespace: 'repositories', key: name } });`,
        `const list = <T>(name: string) => a.get<Array<T>>({ key: { namespace: 'repositories', key: name } });`,
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.manual.map((item) => item.line)).toEqual([1, 2]);
    expect(result.manual[0].reason).toContain('type parameter');
  });

  test('@inject drops undefined from the type it lifts', () => {
    const result = body(
      [
        `class A {`,
        `  constructor(@inject({ key: 'a.Config' }) config: Partial<Cfg> | undefined, @inject({ key: 'a.Other' }) other?: Other | Another | undefined) {}`,
        `}`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(`BindingKeys.build<Partial<Cfg>>({ key: 'a.Config' })`);
    expect(result.output).toContain(`BindingKeys.build<Other | Another>({ key: 'a.Other' })`);
  });

  test('@inject takes the type the decorated parameter or property already claims', () => {
    const result = body(
      [
        `class A {`,
        `  @inject({ key: 'services.Mailer' }) mailer: Mailer;`,
        `  constructor(@inject({ key: 'services.Clock' }) private clock: Clock) {}`,
        `}`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(`BindingKeys.build<Mailer>({ key: 'services.Mailer' })`);
    expect(result.output).toContain(`BindingKeys.build<Clock>({ key: 'services.Clock' })`);
    expect(result.unnamed).toEqual([]);
  });

  test('a key already built with its type is left alone, and a second run changes nothing', () => {
    const built = body(`a.get({ key: BindingKeys.build<Mailer>({ key: 'services.Mailer' }) });\n`);

    expect(built.changed).toBe(false);

    const first = rewrite(`${PRELUDE}a.bind({ key: 'a.A' });\n`);

    expect(rewrite(first.output).changed).toBe(false);
  });
});

describe('devz codemod binding-keys: only the container is rewritten', () => {
  test('a redis helper, a worker pool and a map keep their calls, type arguments included', () => {
    const result = body(
      [
        `redis.get<Session>({ key: 'session:2' });`,
        `workerPool.get<Msg>({ key: 'queue' });`,
        `map.get('x');`,
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.rewritten).toBe(0);
    expect(result.manual).toEqual([]);
  });

  test('a class of your own named Container is not the framework container', () => {
    const result = rewrite(
      [
        `class Container { get<T>(opts: { key: string }): T { return opts.key as T; } }`,
        `declare const mine: Container;`,
        `mine.get<Session>({ key: 'a.A' });`,
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.manual).toEqual([]);
  });

  test("a container of another monorepo's packages/kernel is not the framework's: the package name decides", () => {
    const result = rewrite(
      [
        `class Container { get<T>(opts: { key: string }): T { return opts.key as T; } }`,
        `declare const own: Container;`,
        `own.get<Row>({ key: 'rows.A' });`,
        '',
      ].join('\n'),
      undefined,
      '/virtual/fx/packages/kernel/src/own.ts',
    );

    expect(result.changed).toBe(false);
    expect(result.manual).toEqual([]);
  });

  test('a receiver whose type is not resolved is listed, and its type argument stays', () => {
    const result = body(`loose.get<Session>({ key: 'session:2' });\n`);

    expect(result.changed).toBe(false);
    expect(result.manual).toHaveLength(1);
    expect(result.manual[0].reason).toContain('not resolved');
  });

  test('inject under an alias is the framework inject, one of your own is not', () => {
    const aliased = rewrite(
      [
        `import { inject as Inject } from '@venizia/ignis';`,
        `class A { constructor(@Inject({ key: 'a.Clock' }) clock: Clock) {} }`,
        '',
      ].join('\n'),
    );
    const own = rewrite(
      [
        `declare const inject: (opts: { key: string }) => (t: object, n: string | undefined, i: number) => void;`,
        `class A { constructor(@inject({ key: 'a.Clock' }) clock: Clock) {} }`,
        '',
      ].join('\n'),
      '@venizia/ignis',
    );

    expect(aliased.output).toContain(`BindingKeys.build<Clock>({ key: 'a.Clock' })`);
    expect(own.changed).toBe(false);
  });

  test('a string constant of another module is listed, a built key is not', () => {
    const result = rewrite(
      [
        `import { Container, BindingKeys } from '@venizia/ignis';`,
        `declare const a: Container;`,
        `declare const Keys: { RAW: string; BUILT: ReturnType<typeof BindingKeys.build<Mailer>> };`,
        `a.get({ key: Keys.RAW });`,
        `a.get({ key: Keys.BUILT });`,
        '',
      ].join('\n'),
    );

    expect(result.manual.map((item) => item.line)).toEqual([4]);
    expect(result.manual[0].reason).toContain('string');
  });
});

describe('devz codemod binding-keys: names and comments', () => {
  test('an aliased BindingKeys import is used under its local name', () => {
    const result = rewrite(
      [
        `import { Container, BindingKeys as BK } from '@venizia/ignis';`,
        `declare const a: Container;`,
        `a.get<Mailer>({ key: 'services.Mailer' });`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(
      `a.get({ key: BK.build<Mailer>({ key: 'services.Mailer' }) });`,
    );
    expect(result.output).not.toContain('BindingKeys.build');
  });

  test('a comment inside the type argument that moves is kept', () => {
    const result = body(`a.get</* the mailer */ Mailer>({ key: 'services.Mailer' });\n`);

    expect(result.output).toContain('/* the mailer */');
    expect(result.output).toContain(`BindingKeys.build<Mailer>({ key: 'services.Mailer' })`);
  });
});

const DECLARED = `declare const a: Container;\n`;

describe('devz codemod binding-keys: the import', () => {
  test('BindingKeys joins the import of inject', () => {
    const result = rewrite(
      `import { inject, Container } from '@venizia/ignis';\n${DECLARED}a.bind({ key: 'a.A' });\n`,
    );

    expect(
      result.output.startsWith(`import { inject, Container, BindingKeys } from '@venizia/ignis';`),
    ).toBe(true);
  });

  test('an existing import of BindingKeys is reused, and a type-only import is not', () => {
    const reused = rewrite(
      `import { Container, BindingKeys } from '@venizia/ignis';\n${DECLARED}a.bind({ key: 'a.A' });\n`,
    );

    expect(reused.output.match(/import .*BindingKeys/g)?.length).toBe(1);

    const typeOnly = rewrite(
      `import type { BindingKeys } from '@venizia/ignis';\nimport { Container } from '@venizia/ignis';\n${DECLARED}a.bind({ key: 'a.A' });\n`,
    );

    expect(typeOnly.output).toContain("import { Container, BindingKeys } from '@venizia/ignis';");
  });

  test('a file whose framework names come from its own barrel is not rewritten and is listed, unless --import-from names a module', () => {
    const source = `import { Container } from './container';\n${DECLARED}a.bind({ key: 'a.A' });\n`;
    const refused = rewrite(source);

    expect(refused.changed).toBe(false);
    expect(refused.manual[0].reason).toContain('--import-from');

    const named = rewrite(source, '@/modules/binding/common/constants');

    expect(named.output).toContain(
      "import { BindingKeys } from '@/modules/binding/common/constants';",
    );
    expect(named.output).toContain("BindingKeys.build<unknown>({ key: 'a.A' })");
  });
});

describe('devz codemod binding-keys: the command', () => {
  let root: string;
  let logs: ReturnType<typeof spyOn>;
  let warns: ReturnType<typeof spyOn>;
  let errors: ReturnType<typeof spyOn>;

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'binding-keys-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    logs = spyOn(console, 'log').mockImplementation(() => {});
    warns = spyOn(console, 'warn').mockImplementation(() => {});
    errors = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logs.mockRestore();
    warns.mockRestore();
    errors.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  const commit = () => {
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'],
      { cwd: root },
    );
  };

  /** The framework as an installed package, so the checker resolves a container the way it does in a project. */
  const installFramework = () => {
    const directory = join(root, 'node_modules/@venizia/ignis');

    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'index.d.ts'), FRAMEWORK_STUB);
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ name: '@venizia/ignis', version: '0.0.0', types: 'index.d.ts' }),
    );
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          experimentalDecorators: true,
          moduleResolution: 'bundler',
          module: 'esnext',
          noLib: true,
        },
      }),
    );
    writeFileSync(join(root, '.gitignore'), 'node_modules\n');
  };

  const write = (name: string, text: string) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, name), text);
    commit();
  };

  /**
   * The framework the way Bun installs it: the package sits in the isolated store, `node_modules/@venizia/<name>` is a symlink to
   * it, the declarations live in `dist/esm`, and `dist/esm/package.json` carries no name (`{ "type": "module" }`).
   */
  const installFrameworkLikeBun = () => {
    const store = join(
      root,
      'node_modules/.bun/@venizia+ignis-inversion@0.5.0-0/node_modules/@venizia/ignis-inversion',
    );

    mkdirSync(join(store, 'dist/esm'), { recursive: true });
    writeFileSync(join(store, 'dist/esm/index.d.ts'), FRAMEWORK_STUB);
    writeFileSync(
      join(store, 'dist/esm/package.json'),
      JSON.stringify({ type: 'module', sideEffects: ['./index.js'] }),
    );
    writeFileSync(
      join(store, 'package.json'),
      JSON.stringify({
        name: '@venizia/ignis-inversion',
        version: '0.5.0-0',
        types: './dist/esm/index.d.ts',
      }),
    );
    mkdirSync(join(root, 'node_modules/@venizia'), { recursive: true });
    symlinkSync(store, join(root, 'node_modules/@venizia/ignis-inversion'), 'dir');
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          experimentalDecorators: true,
          moduleResolution: 'bundler',
          module: 'esnext',
          noLib: true,
        },
      }),
    );
    writeFileSync(join(root, '.gitignore'), 'node_modules\n');
  };

  test('a framework installed the way Bun installs it (store, symlink, nameless dist/esm/package.json) is found', async () => {
    installFrameworkLikeBun();
    write(
      'src/a.ts',
      `import { Container } from '@venizia/ignis-inversion';\ndeclare const a: Container;\na.bind({ key: 'a.A' });\n`,
    );

    const code = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--write'] });

    expect(code).toBe(0);
    expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).toContain(
      "BindingKeys.build<unknown>({ key: 'a.A' })",
    );
  });

  test('a package that re-exports the framework (ARDOR re-exports IGNIS) is found too', async () => {
    installFrameworkLikeBun();
    const kit = join(root, 'node_modules/@acme/kit');

    mkdirSync(kit, { recursive: true });
    writeFileSync(join(kit, 'index.d.ts'), `export * from '@venizia/ignis-inversion';\n`);
    writeFileSync(
      join(kit, 'package.json'),
      JSON.stringify({ name: '@acme/kit', version: '1.0.0', types: 'index.d.ts' }),
    );
    write(
      'src/a.ts',
      `import { Container } from '@acme/kit';\ndeclare const a: Container;\na.get<string>({ key: 'a.A' });\n`,
    );

    const code = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--check'] });

    expect(code).toBe(1);
  });

  test('the name is listed, and --reverse is refused: a downgrade restores from git', async () => {
    const code = await CodemodCommand.run({ root, args: ['binding-keys', '--reverse'] });

    expect(code).toBe(2);
    expect(errors.mock.calls.flat().join('\n')).toContain('not reversible');
  });

  test('a dry run writes nothing; --write needs a path; --write changes the file', async () => {
    installFramework();
    write(
      'src/a.ts',
      `import { Container } from '@venizia/ignis';\ndeclare const a: Container;\na.bind({ key: 'a.A' });\n`,
    );
    const file = join(root, 'src/a.ts');
    const before = readFileSync(file, 'utf8');

    const result = await CodemodCommand.run({ root, args: ['binding-keys', 'src'] });
    expect(result).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(before);

    const result2 = await CodemodCommand.run({ root, args: ['binding-keys', '--write'] });
    expect(result2).toBe(2);

    const result3 = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--write'] });
    expect(result3).toBe(0);
    expect(readFileSync(file, 'utf8')).toContain("BindingKeys.build<unknown>({ key: 'a.A' })");
    expect(warns.mock.calls.flat().join('\n')).toContain('type  ');
  });

  test('--check exits 1 while a file would change, and 0 once it is clean', async () => {
    installFramework();
    write(
      'src/a.ts',
      `import { Container } from '@venizia/ignis';\ndeclare const a: Container;\na.bind({ key: 'a.A' });\n`,
    );

    const result4 = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--check'] });
    expect(result4).toBe(1);

    await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--write'] });

    const result5 = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--check'] });
    expect(result5).toBe(0);
  });

  test('--import-from is read, and a missing module is a usage error', async () => {
    installFramework();
    write(
      'src/a.ts',
      `import type { Container } from '../node_modules/@venizia/ignis/index';\ndeclare const a: Container;\na.bind({ key: 'a.A' });\n`,
    );

    const result6 = await CodemodCommand.run({
      root,
      args: ['binding-keys', 'src', '--import-from'],
    });
    expect(result6).toBe(2);
    const result7 = await CodemodCommand.run({
      root,
      args: ['binding-keys', 'src', '--write', '--import-from', '@venizia/ignis'],
    });
    expect(result7).toBe(0);
    expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).toContain(
      "import { BindingKeys } from '@venizia/ignis';",
    );
  });

  const MAILER_FILE = `export interface Mailer { send(): void }\n`;
  const KEYS_FILE = [
    `import type { Mailer } from './mailer';`,
    `export type Unused = Mailer;`,
    `export class Keys {`,
    `  static readonly MAILER = 'services.Mailer';`,
    `}`,
    '',
  ].join('\n');
  const KEYS_WITHOUT_MAILER_FILE = [
    `export class Keys {`,
    `  static readonly MAILER = 'services.Mailer';`,
    `}`,
    '',
  ].join('\n');
  const USE_FILE = [
    `import { Container } from '@venizia/ignis';`,
    `import { Keys } from './keys';`,
    `import type { Mailer } from './mailer';`,
    `declare const a: Container;`,
    `a.get<Mailer>({ key: Keys.MAILER });`,
    '',
  ].join('\n');
  const FROM = ['--import-from', '@venizia/ignis'];

  const project = (keys: string) => {
    installFramework();
    write('src/mailer.ts', MAILER_FILE);
    write('src/keys.ts', keys);
    write('src/use.ts', USE_FILE);
  };

  test('a key constant declared in another file is built there with the type that file sees, the use file is not rewritten, a second run changes nothing', async () => {
    project(KEYS_FILE);

    const code = await CodemodCommand.run({
      root,
      args: ['binding-keys', 'src', '--write', ...FROM],
    });

    expect(code).toBe(0);
    expect(readFileSync(join(root, 'src/keys.ts'), 'utf8')).toContain(
      "static readonly MAILER = BindingKeys.build<Mailer>({ key: 'services.Mailer' });",
    );
    expect(readFileSync(join(root, 'src/keys.ts'), 'utf8')).toContain(
      "import { BindingKeys } from '@venizia/ignis';",
    );
    expect(readFileSync(join(root, 'src/use.ts'), 'utf8')).toBe(USE_FILE);
    expect(warns).not.toHaveBeenCalled();

    commit();
    const again = await CodemodCommand.run({
      root,
      args: ['binding-keys', 'src', '--check', ...FROM],
    });

    expect(again).toBe(0);
  });

  test('a map declared as const in another file is built there, a plain object literal is not', async () => {
    installFramework();
    write(
      'src/keys.ts',
      [
        `import { BindingKeys } from '@venizia/ignis';`,
        `export const used = BindingKeys;`,
        `export const MAP = { X: 'map.X' } as const;`,
        `export const LOOSE = { Y: 'map.Y' };`,
        '',
      ].join('\n'),
    );
    write(
      'src/use.ts',
      [
        `import { Container } from '@venizia/ignis';`,
        `import { MAP, LOOSE } from './keys';`,
        `declare const a: Container;`,
        `a.get<number>({ key: MAP.X });`,
        `a.get<number>({ key: LOOSE.Y });`,
        '',
      ].join('\n'),
    );

    await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--write'] });
    const keys = readFileSync(join(root, 'src/keys.ts'), 'utf8');

    expect(keys).toContain("{ X: BindingKeys.build<number>({ key: 'map.X' }) } as const");
    expect(keys).toContain("{ Y: 'map.Y' }");
  });

  test('a type the declaration file cannot see is not copied there: unknown, listed as a type to name, no import added', async () => {
    project(KEYS_WITHOUT_MAILER_FILE);

    const code = await CodemodCommand.run({
      root,
      args: ['binding-keys', 'src', '--write', ...FROM],
    });
    const keys = readFileSync(join(root, 'src/keys.ts'), 'utf8');

    expect(code).toBe(0);
    expect(keys).toContain("BindingKeys.build<unknown>({ key: 'services.Mailer' })");
    expect(keys).not.toContain("from './mailer'");
    expect(warns.mock.calls.flat().join('\n')).toContain('src/keys.ts:2');
  });

  test('a keys file that imports nothing from the framework is listed to pass --import-from, and not built', async () => {
    project(KEYS_WITHOUT_MAILER_FILE);

    const code = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--write'] });

    expect(code).toBe(0);
    expect(readFileSync(join(root, 'src/keys.ts'), 'utf8')).toBe(KEYS_WITHOUT_MAILER_FILE);
    expect(warns.mock.calls.flat().join('\n')).toContain('pass --import-from');
  });

  test('a declaration outside the files of the run is listed, not edited', async () => {
    project(KEYS_FILE);

    const code = await CodemodCommand.run({
      root,
      args: ['binding-keys', 'src/use.ts', '--write', ...FROM],
    });

    expect(code).toBe(0);
    expect(readFileSync(join(root, 'src/keys.ts'), 'utf8')).toBe(KEYS_FILE);
    expect(warns.mock.calls.flat().join('\n')).toContain('a string held in a name');
  });

  test('a declaration file with local changes is refused and nothing is written', async () => {
    project(KEYS_FILE);
    writeFileSync(join(root, 'src/keys.ts'), `${KEYS_FILE}// edited\n`);

    const code = await CodemodCommand.run({
      root,
      args: ['binding-keys', 'src', '--write', ...FROM],
    });

    expect(code).toBe(1);
    expect(readFileSync(join(root, 'src/keys.ts'), 'utf8')).not.toContain('BindingKeys.build');
    expect(readFileSync(join(root, 'src/use.ts'), 'utf8')).toBe(USE_FILE);
  });

  test('inside a git repository --write refuses a file with local changes', async () => {
    installFramework();
    write(
      'src/a.ts',
      `import { Container } from '@venizia/ignis';\ndeclare const a: Container;\na.bind({ key: 'a.A' });\n`,
    );
    writeFileSync(
      join(root, 'src/a.ts'),
      `import { Container } from '@venizia/ignis';\ndeclare const a: Container;\na.bind({ key: 'a.A' });\n// edited\n`,
    );

    const result8 = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--write'] });
    expect(result8).toBe(1);
    expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).not.toContain('BindingKeys');
  });
});

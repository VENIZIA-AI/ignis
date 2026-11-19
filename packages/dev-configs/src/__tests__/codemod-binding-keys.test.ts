import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { BindingKeysCodemod } from '../cli/codemod/binding-keys';

const IMPORT = `import { inject } from '@venizia/ignis'; `;

const rewrite = (source: string, importFrom?: string) => {
  const result = BindingKeysCodemod.rewrite({
    typescript: ts,
    fileName: 'file.ts',
    source,
    importFrom,
  });

  return result;
};

/** The rewrite of `body` in a file that imports `inject` from the framework; the import line is left out of the answer. */
const body = (source: string) => {
  const result = rewrite(`${IMPORT}${source}`);

  return {
    ...result,
    output: result.output.replace("import { inject, BindingKeys } from '@venizia/ignis'; ", ''),
  };
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

  test('a key held in a const of the file is rewritten where it is declared, once', () => {
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
        `a.get({ key: MAILER });`,
        `a.bind({ key: MAILER });`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(1);
  });

  test('a name declared twice in the file is not guessed at', () => {
    const result = body(
      [
        `{ const K = 'a.A'; a.bind({ key: K }); }`,
        `{ const K = 'b.B'; a.bind({ key: K }); }`,
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
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

  test('a type parameter of the enclosing function stays on the call, and the key is built for unknown', () => {
    const result = body(
      `const read = <T>(name: string) => a.get<T>({ key: { namespace: 'repositories', key: name } });\n`,
    );

    expect(result.output).toBe(
      `const read = <T>(name: string) => a.get<T>({ key: BindingKeys.build<unknown>({ namespace: 'repositories', key: name }) });\n`,
    );
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
    const source = `${IMPORT}a.get({ key: BindingKeys.build<Mailer>({ key: 'services.Mailer' }) });\n`;

    expect(rewrite(source).changed).toBe(false);

    const first = rewrite(`${IMPORT}a.bind({ key: 'a.A' });\n`);

    expect(rewrite(first.output).changed).toBe(false);
  });
});

describe('devz codemod binding-keys: the import', () => {
  test('BindingKeys joins the import of inject', () => {
    const result = rewrite(`${IMPORT}a.bind({ key: 'a.A' });\n`);

    expect(result.output.startsWith(`import { inject, BindingKeys } from '@venizia/ignis'; `)).toBe(
      true,
    );
  });

  test('an existing import of BindingKeys is reused, and a type-only import is not', () => {
    const reused = rewrite(
      `import { BindingKeys } from '@venizia/ignis-inversion';\na.bind({ key: 'a.A' });\n`,
    );

    expect(reused.output.match(/import .*BindingKeys/g)?.length).toBe(1);

    const typeOnly = rewrite(
      `import type { BindingKeys } from '@venizia/ignis-inversion';\nimport { inject } from '@venizia/ignis';\na.bind({ key: 'a.A' });\n`,
    );

    expect(typeOnly.output).toContain("import { inject, BindingKeys } from '@venizia/ignis';");
  });

  test("an inject taken from the file's own barrel is not where BindingKeys comes from", () => {
    const result = rewrite(`import { inject } from '../barrel';\na.bind({ key: 'a.A' });\n`);

    expect(result.changed).toBe(false);
    expect(result.manual[0].reason).toContain('--import-from');
  });

  test('a file with no ignis import is not rewritten and is listed, unless --import-from names one', () => {
    const source = `import { thing } from './thing';\na.bind({ key: 'a.A' });\n`;
    const refused = rewrite(source);

    expect(refused.changed).toBe(false);
    expect(refused.manual[0].reason).toContain('--import-from');

    const named = rewrite(source, '@/modules/binding/common/constants');

    expect(named.output).toContain(
      "import { BindingKeys } from '@/modules/binding/common/constants';",
    );
    expect(named.output).toContain("BindingKeys.build<unknown>({ key: 'a.A' })");
  });

  test('a file with no import at all gets the import at the top with --import-from', () => {
    const result = rewrite(`a.bind({ key: 'a.A' });\n`, '@venizia/ignis');

    expect(result.output.startsWith("import { BindingKeys } from '@venizia/ignis';\n")).toBe(true);
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

  const write = (name: string, text: string) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, name), text);
    commit();
  };

  test('the name is listed, and --reverse is refused: a downgrade restores from git', async () => {
    const code = await CodemodCommand.run({ root, args: ['binding-keys', '--reverse'] });

    expect(code).toBe(2);
    expect(errors.mock.calls.flat().join('\n')).toContain('not reversible');
  });

  test('a dry run writes nothing; --write needs a path; --write changes the file', async () => {
    write('src/a.ts', `import { inject } from '@venizia/ignis';\na.bind({ key: 'a.A' });\n`);
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
    write('src/a.ts', `import { inject } from '@venizia/ignis';\na.bind({ key: 'a.A' });\n`);

    const result4 = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--check'] });
    expect(result4).toBe(1);

    await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--write'] });

    const result5 = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--check'] });
    expect(result5).toBe(0);
  });

  test('--import-from is read, and a missing module is a usage error', async () => {
    write('src/a.ts', `a.bind({ key: 'a.A' });\n`);

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

  test('inside a git repository --write refuses a file with local changes', async () => {
    write('src/a.ts', `import { inject } from '@venizia/ignis';\na.bind({ key: 'a.A' });\n`);
    writeFileSync(
      join(root, 'src/a.ts'),
      `import { inject } from '@venizia/ignis';\na.bind({ key: 'a.A' });\n// edited\n`,
    );

    const result8 = await CodemodCommand.run({ root, args: ['binding-keys', 'src', '--write'] });
    expect(result8).toBe(1);
    expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).not.toContain('BindingKeys');
  });
});

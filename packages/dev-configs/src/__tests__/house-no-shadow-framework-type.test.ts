import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  FrameworkExports,
  houseConfigs,
  houseEslintPlugin,
  NoShadowFrameworkTypeRule,
} from '../linters/house';

const NAME = NoShadowFrameworkTypeRule.NAME;
const roots: Array<string> = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const write = (opts: { root: string; path: string; content: string }) => {
  const file = join(opts.root, opts.path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, opts.content);
};

/**
 * A project that depends on a fake `@venizia/fake-helpers`, installed under node_modules with a root entry that re-exports
 * the declarations of `types.d.ts` (`export *`) and a narrow `./common` entry for one of them.
 */
const buildProject = (opts?: { name?: string; dependsOn?: string }) => {
  const root = mkdtempSync(join(tmpdir(), 'no-shadow-'));
  roots.push(root);
  const installed = join('node_modules', '@venizia', 'fake-helpers');

  write({
    root,
    path: 'package.json',
    content: JSON.stringify({
      name: opts?.name ?? 'app',
      dependencies: { [opts?.dependsOn ?? '@venizia/fake-helpers']: '1.0.0' },
    }),
  });
  write({
    root,
    path: join(installed, 'package.json'),
    content: JSON.stringify({
      name: '@venizia/fake-helpers',
      exports: {
        '.': { types: './dist/index.d.ts', default: './dist/index.js' },
        './common': { types: './dist/common.d.ts', default: './dist/common.js' },
      },
    }),
  });
  write({
    root,
    path: join(installed, 'dist', 'index.d.ts'),
    content: `export * from './types.js';\nexport { Runner } from './runner.js';\nexport * as Tools from './tools.js';\nexport declare const VERSION: string;\n`,
  });
  write({
    root,
    path: join(installed, 'dist', 'types.d.ts'),
    content: `export type TNullable<T> = T | undefined | null;\nexport interface IApplicationInfo { name: string }\nexport type T<X> = X;\nexport type ValueOrPromise<T> = T | Promise<T>;\n`,
  });
  write({
    root,
    path: join(installed, 'dist', 'common.d.ts'),
    content: `export type { TNullable } from './types.js';\n`,
  });
  write({
    root,
    path: join(installed, 'dist', 'runner.d.ts'),
    content: `export declare class Runner {}\n`,
  });
  write({
    root,
    path: join(installed, 'dist', 'tools.d.ts'),
    content: `export declare const tool: number;\n`,
  });

  return { root, filename: join(root, 'src', 'subject.ts') };
};

const lint = (opts: {
  project: { root: string; filename: string };
  code: string;
  options?: Linter.RuleEntry;
}) => {
  const config: Linter.Config[] = [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser as Linter.Parser },
      plugins: { venizia: houseEslintPlugin },
      rules: { [NAME]: opts.options ?? ['error'] },
    },
  ];

  return new Linter({ cwd: opts.project.root }).verify(opts.code, config, {
    filename: opts.project.filename,
  });
};

describe('FrameworkExports', () => {
  test('reads the names of the installed packages, following export * and naming the narrowest entry', () => {
    const { root } = buildProject();
    const names = FrameworkExports.of({ directory: join(root, 'src') });

    expect(names.get('ValueOrPromise')).toBe('@venizia/fake-helpers');
    expect(names.get('TNullable')).toBe('@venizia/fake-helpers/common');
    expect(names.get('Runner')).toBe('@venizia/fake-helpers');
    expect(names.get('Tools')).toBe('@venizia/fake-helpers');
    expect(names.get('VERSION')).toBe('@venizia/fake-helpers');
  });

  test('a project that depends on no @venizia package, or whose package is not installed, has no names', () => {
    const missing = buildProject({ dependsOn: '@venizia/not-installed' });

    expect(FrameworkExports.of({ directory: join(missing.root, 'src') }).size).toBe(0);
  });
});

describe('venizia/no-shadow-framework-type', () => {
  test('a type alias or interface with a framework name is reported with the module to import it from', () => {
    const project = buildProject();
    const findings = lint({
      project,
      code: `export type TNullable<T> = T | null | undefined;\ninterface IApplicationInfo { id: string }\ntype ValueOrPromise<X> = X;\n`,
    });

    expect(findings).toHaveLength(3);
    expect(findings[0]?.message).toContain('@venizia/fake-helpers/common');
    expect(findings[1]?.message).toContain('IApplicationInfo');
  });

  test('a name the file imports, a short name, an unknown name and a value are not reported', () => {
    const project = buildProject();

    expect(
      lint({
        project,
        code: `import type { TNullable } from '@venizia/fake-helpers/common';\nexport type TOther = TNullable<string>;\n`,
      }),
    ).toHaveLength(0);
    expect(lint({ project, code: `type T<X> = X;\ninterface Id { a: 1 }\n` })).toHaveLength(0);
    expect(
      lint({ project, code: `type TMine = string;\ninterface IMine { a: 1 }\n` }),
    ).toHaveLength(0);
    expect(lint({ project, code: `const TNullable = 1;\nexport class Runner2 {}\n` })).toHaveLength(
      0,
    );
  });

  test('a declaration inside declare module or declare global (an augmentation) is not reported', () => {
    const project = buildProject();

    expect(
      lint({
        project,
        code: `declare module 'x' { interface IApplicationInfo { id: string } }\ndeclare global { type TNullable<T> = T }\n`,
      }),
    ).toHaveLength(0);
  });

  test('allow and minLength narrow it', () => {
    const project = buildProject();
    const code = `type TNullable<T> = T;\ninterface IApplicationInfo { a: 1 }\n`;

    expect(lint({ project, code, options: ['error', { allow: ['TNullable'] }] })).toHaveLength(1);
    expect(lint({ project, code, options: ['error', { minLength: 30 }] })).toHaveLength(0);
  });

  test('a package may declare what it exports itself, and a declaration file is skipped', () => {
    const own = buildProject({ name: '@venizia/fake-helpers' });

    expect(lint({ project: own, code: `export type TNullable<T> = T | null;\n` })).toHaveLength(0);

    const project = buildProject();
    const dts = { ...project, filename: join(project.root, 'src', 'subject.d.ts') };

    expect(lint({ project: dts, code: `export type TNullable<T> = T;\n` })).toHaveLength(0);
  });

  test('houseConfigs turns it on as an error', () => {
    const project = buildProject();
    const messages = new Linter({ cwd: project.root }).verify(
      `export type TNullable<T> = T;\n`,
      houseConfigs,
      {
        filename: project.filename,
      },
    );
    const finding = messages.find((message) => message.ruleId === NAME);

    expect(finding?.severity).toBe(2);
  });
});

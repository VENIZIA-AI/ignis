import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { ConnectorImports, ConnectorSpecifiers } from '../cli/codemod/connector-imports';

const rewrite = (source: string, fileName = 'file.ts') =>
  ConnectorImports.rewrite({ typescript: ts, fileName, source });

describe('devz codemod connector-imports: the rewrite', () => {
  test('every removed sub-path moves to the same name under @venizia/ignis-connectors', () => {
    expect(ConnectorSpecifiers.SUBPATHS.length).toBe(13);

    for (const subpath of ConnectorSpecifiers.SUBPATHS) {
      const result = rewrite(`import { X } from '@venizia/ignis/${subpath}';\n`);

      expect(result.output).toBe(`import { X } from '@venizia/ignis-connectors/${subpath}';\n`);
      expect(result.rewritten).toBe(1);
    }
  });

  test('imports, exports, dynamic imports, require, import types, import = and mock.module all move', () => {
    const source = [
      `import type { A } from "@venizia/ignis/postgres";`,
      `import B from '@venizia/ignis/sqlite/libsql';`,
      `import '@venizia/ignis/typesense';`,
      `export * from '@venizia/ignis/search';`,
      `export { C } from "@venizia/ignis/meilisearch";`,
      `import D = require('@venizia/ignis/relational');`,
      `const E = await import('@venizia/ignis/postgres/pglite');`,
      `const F = require('@venizia/ignis/search/controllers');`,
      `type G = import('@venizia/ignis/typesense/controllers').H;`,
      `mock.module('@venizia/ignis/postgres/supabase', () => ({}));`,
      '',
    ].join('\n');

    const result = rewrite(source);

    expect(result.rewritten).toBe(10);
    expect(result.output).not.toContain('@venizia/ignis/');
    expect(result.output).toContain(`import type { A } from "@venizia/ignis-connectors/postgres";`);
    expect(result.output).toContain(`import B from '@venizia/ignis-connectors/sqlite/libsql';`);
    expect(result.output).toContain(
      `type G = import('@venizia/ignis-connectors/typesense/controllers').H;`,
    );
  });

  test('names that stay are not touched: the root, the other sub-paths, the connectors package, text and comments', () => {
    const source = [
      `import { a } from '@venizia/ignis';`,
      `import { b } from '@venizia/ignis/mail';`,
      `import { c } from '@venizia/ignis/static-asset';`,
      `import { d } from '@venizia/ignis/testing';`,
      `import { e } from '@venizia/ignis-connectors/postgres';`,
      `import { f } from '@venizia/ignis/postgres-extra';`,
      `// import { g } from '@venizia/ignis/postgres';`,
      `const text = '@venizia/ignis/postgres';`,
      `log('@venizia/ignis/sqlite');`,
      '',
    ].join('\n');

    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
  });

  test('module augmentation, resolve calls, importActual and a plain template literal move too', () => {
    const source = [
      "declare module '@venizia/ignis/postgres' {}",
      "const a = require.resolve('@venizia/ignis/sqlite');",
      "const b = import.meta.resolve('@venizia/ignis/search');",
      "const c = await vi.importActual('@venizia/ignis/typesense');",
      "const d = await jest.requireActual('@venizia/ignis/meilisearch');",
      'const e = await import(`@venizia/ignis/relational`);',
      '',
    ].join('\n');

    const result = rewrite(source);

    expect(result.rewritten).toBe(6);
    expect(result.output).not.toContain('@venizia/ignis/');
    expect(result.output).toContain('import(`@venizia/ignis-connectors/relational`)');
  });

  test('a .tsx file is read as TSX', () => {
    const result = rewrite(
      `import { X } from '@venizia/ignis/postgres';\nexport const view = <div />;\n`,
      'view.tsx',
    );

    expect(result.rewritten).toBe(1);
    expect(result.output).toContain(`'@venizia/ignis-connectors/postgres'`);
  });
});

describe('devz codemod connector-imports: the command', () => {
  let root: string;
  let logs: string[];
  let warnings: string[];
  let errors: string[];

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'connector-imports-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'src'), { recursive: true });
    logs = [];
    warnings = [];
    errors = [];
    spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    spyOn(console, 'warn').mockImplementation((...args) => {
      warnings.push(args.join(' '));
    });
    spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const commit = (files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
      writeFileSync(join(root, path), content);
    }
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-q',
        '-m',
        'fixture',
      ],
      { cwd: root },
    );
  };
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const OLD = `import { X } from '@venizia/ignis/postgres';\n`;
  const NEW = `import { X } from '@venizia/ignis-connectors/postgres';\n`;

  test('a dry run lists the file and writes nothing', async () => {
    commit({ 'src/a.ts': OLD, 'package.json': '{ "dependencies": {} }' });

    const code = await CodemodCommand.run({ root, args: ['connector-imports'] });

    expect(code).toBe(0);
    expect(read('src/a.ts')).toBe(OLD);
    expect(logs.join('\n')).toContain('would change  src/a.ts');
  });

  test('a bare --write with no path is allowed, as for namespace-functions: it touches only a file with the old text', async () => {
    commit({
      'src/a.ts': OLD,
      'src/b.ts': 'export const b = 1;\n',
      'package.json': '{ "dependencies": { "@venizia/ignis-connectors": "1.0.0" } }',
    });

    const code = await CodemodCommand.run({ root, args: ['connector-imports', '--write'] });

    expect(code).toBe(0);
    expect(read('src/a.ts')).toBe(NEW);
    expect(read('src/b.ts')).toBe('export const b = 1;\n');
  });

  test('--write rewrites a committed file', async () => {
    commit({
      'src/a.ts': OLD,
      'package.json': '{ "dependencies": { "@venizia/ignis-connectors": "1.0.0" } }',
    });

    const code = await CodemodCommand.run({ root, args: ['connector-imports', '--write'] });

    expect(code).toBe(0);
    expect(read('src/a.ts')).toBe(NEW);
    expect(warnings.join('\n')).not.toContain('does not list');
  });

  test('it says which package.json does not list @venizia/ignis-connectors', async () => {
    commit({
      'src/a.ts': OLD,
      'package.json': '{ "dependencies": { "@venizia/ignis": "1.0.0" } }',
    });

    await CodemodCommand.run({ root, args: ['connector-imports'] });

    expect(warnings.join('\n')).toContain(
      'package.json  does not list @venizia/ignis-connectors: add it as a dependency',
    );
  });

  test('--write refuses a file with local changes and exits 1', async () => {
    commit({ 'src/a.ts': OLD });
    writeFileSync(join(root, 'src/a.ts'), `${OLD}// edited\n`);

    const code = await CodemodCommand.run({ root, args: ['connector-imports', '--write'] });

    expect(code).toBe(1);
    expect(read('src/a.ts')).toBe(`${OLD}// edited\n`);
    expect(warnings.join('\n')).toContain('refused  src/a.ts  has local changes');
  });

  test('--check exits 1 while a file would change, and 0 when none would', async () => {
    commit({ 'src/a.ts': OLD });

    const first = await CodemodCommand.run({ root, args: ['connector-imports', '--check'] });
    expect(first).toBe(1);

    await CodemodCommand.run({ root, args: ['connector-imports', '--write'] });
    execFileSync('git', ['add', '-A'], { cwd: root });
    const second = await CodemodCommand.run({ root, args: ['connector-imports', '--check'] });
    expect(second).toBe(0);
  });

  test('an unknown option is a usage error that writes nothing', async () => {
    commit({ 'src/a.ts': OLD });

    const code = await CodemodCommand.run({ root, args: ['connector-imports', '--force'] });

    expect(code).toBe(2);
    expect(errors.join('\n')).toContain('unknown option "--force"');
    expect(read('src/a.ts')).toBe(OLD);
  });
});

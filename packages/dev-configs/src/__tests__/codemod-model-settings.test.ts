import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { CodemodFiles } from '../cli/codemod/files';
import { migrateModelSettings } from '../cli/codemod/model-settings';

const run = (source: string) => {
  return migrateModelSettings({ typescript: ts, fileName: 'product.model.ts', source });
};

const model = (settings: string) =>
  `@model({ type: 'entity', settings: ${settings} })\nclass Product {}\n`;
const migrated = (settings: string) => run(model(settings)).output;

describe('migrateModelSettings - each old key', () => {
  test('defaultFilter becomes query.filter', () => {
    expect(migrated('{ defaultFilter: { where: { isDeleted: false } } }')).toBe(
      model('{ query: { filter: { where: { isDeleted: false } } } }'),
    );
  });

  test('defaultLimit becomes query.limit.default', () => {
    expect(migrated('{ defaultLimit: 20 }')).toBe(model('{ query: { limit: { default: 20 } } }'));
  });

  test('maxLimit becomes query.limit.max', () => {
    expect(migrated('{ maxLimit: 200 }')).toBe(model('{ query: { limit: { max: 200 } } }'));
  });

  test('scopeFilter becomes access, resolve and onMissing and columns untouched', () => {
    expect(
      migrated(
        "{ scopeFilter: { resolve: () => null, onMissing: 'allow', columns: ['merchantId'] } }",
      ),
    ).toBe(
      model("{ access: { resolve: () => null, onMissing: 'allow', columns: ['merchantId'] } }"),
    );
  });

  test('scopeFilter.writeGuard becomes access.write.mode', () => {
    expect(migrated("{ scopeFilter: { resolve, writeGuard: 'assign' } }")).toBe(
      model("{ access: { resolve, write: { mode: 'assign' } } }"),
    );
  });

  test('scopeFilter.sharedRows becomes access.write.sharedRows', () => {
    expect(migrated('{ scopeFilter: { resolve, sharedRows: true } }')).toBe(
      model('{ access: { resolve, write: { sharedRows: true } } }'),
    );
  });

  test('writeGuard and sharedRows together share one write object, in either order', () => {
    const expected = model("{ access: { resolve, write: { mode: 'assign', sharedRows: true } } }");

    expect(migrated("{ scopeFilter: { resolve, writeGuard: 'assign', sharedRows: true } }")).toBe(
      expected,
    );
    expect(migrated("{ scopeFilter: { resolve, sharedRows: true, writeGuard: 'assign' } }")).toBe(
      expected,
    );
  });

  test('a value that is a variable or a call moves as written', () => {
    expect(
      migrated('{ defaultLimit: DEFAULT_PAGE, maxLimit: limits.max(), defaultFilter: softDelete }'),
    ).toBe(
      model(
        '{ query: { filter: softDelete, limit: { default: DEFAULT_PAGE, max: limits.max() } }, }',
      ),
    );
  });
});

describe('migrateModelSettings - combinations', () => {
  test('every old key together, with hiddenProperties and authorize left where they were', () => {
    const result = run(`@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['costPrice'],
    authorize: { principal: 'Product' },
    defaultFilter: { where: { isDeleted: false } },
    defaultLimit: 20,
    maxLimit: 200,
    scopeFilter: { resolve: () => null, writeGuard: 'reject', sharedRows: false },
  },
})
class Product {}
`);

    expect(result.rewritten).toBe(1);
    expect(result.output).toBe(`@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['costPrice'],
    authorize: { principal: 'Product' },
    query: { filter: { where: { isDeleted: false } }, limit: { default: 20, max: 200 } },
    access: { resolve: () => null, write: { mode: 'reject', sharedRows: false } },
  },
})
class Product {}
`);
  });

  test('the query properties need not be next to each other', () => {
    expect(migrated("{ defaultLimit: 5, hiddenProperties: ['x'], maxLimit: 9 }")).toBe(
      model("{ query: { limit: { default: 5, max: 9 } }, hiddenProperties: ['x'] }"),
    );
  });

  test('several models in one file are all rewritten', () => {
    const result = run(`${model('{ defaultLimit: 1 }')}${model('{ maxLimit: 2 }')}`);

    expect(result.rewritten).toBe(2);
    expect(result.output).toBe(
      `${model('{ query: { limit: { default: 1 } } }')}${model('{ query: { limit: { max: 2 } } }')}`,
    );
  });

  test('the last property without a trailing comma leaves no dangling comma', () => {
    const result = run(`@model({
  settings: {
    hiddenProperties: ['x'],
    defaultLimit: 3
  },
})
class Product {}
`);

    expect(result.output).toContain(
      "hiddenProperties: ['x'],\n    query: { limit: { default: 3 } }\n  },",
    );
  });
});

describe('migrateModelSettings - an existing query or access', () => {
  test('old limits join an existing query.filter', () => {
    expect(migrated('{ query: { filter: { where: {} } }, defaultLimit: 5, maxLimit: 9 }')).toBe(
      model('{ query: { filter: { where: {} }, limit: { default: 5, max: 9 } }, }'),
    );
  });

  test('an old filter joins an existing query.limit', () => {
    expect(migrated('{ query: { limit: { max: 9 } }, defaultFilter: { where: {} } }')).toBe(
      model('{ query: { limit: { max: 9 }, filter: { where: {} } } }'),
    );
  });

  test('an old default limit joins an existing query.limit', () => {
    expect(migrated('{ query: { limit: { max: 9 } }, defaultLimit: 5 }')).toBe(
      model('{ query: { limit: { max: 9, default: 5 } } }'),
    );
  });

  test('an old key and the new key for the same value are reported and left alone', () => {
    const source = model('{ query: { limit: { default: 1 } }, defaultLimit: 5 }');
    const result = run(source);

    expect(result.changed).toBe(false);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]?.reason).toContain('both set');
  });

  test('scopeFilter next to an existing access is not touched blindly: the decorator would throw on it', () => {
    const result = run(model('{ access: { resolve }, scopeFilter: { resolve } }'));

    expect(result.output).toContain('access: { resolve }');
  });
});

describe('migrateModelSettings - comments and formatting', () => {
  test('a comment above a moved property stays above the new property', () => {
    const result = run(`@model({
  settings: {
    // soft delete: hide removed rows
    defaultFilter: { where: { isDeleted: false } },
    // keep pages small
    defaultLimit: 20,
  },
})
class Product {}
`);

    expect(result.output).toBe(`@model({
  settings: {
    // soft delete: hide removed rows
    // keep pages small
    query: { filter: { where: { isDeleted: false } }, limit: { default: 20 } },
  },
})
class Product {}
`);
  });

  test('code outside the settings is byte for byte unchanged', () => {
    const before = "import { model } from '@venizia/ignis';\n\n/** Docs */\nexport ";
    const after = 'class Product { id = 1; }\n// the end\n';
    const result = run(`${before}${model('{ maxLimit: 3 }')}${after}`);

    expect(result.output.startsWith(before)).toBe(true);
    expect(result.output.endsWith(after)).toBe(true);
  });
});

describe('migrateModelSettings - never guesses', () => {
  test.each([
    [
      'a variable',
      'const settings = {};\n@model({ settings })\nclass A {}\n',
      /not an object literal/,
    ],
    [
      'a variable value',
      'const s = {};\n@model({ settings: s })\nclass A {}\n',
      /not an object literal/,
    ],
    ['a call', '@model({ settings: build() })\nclass A {}\n', /not an object literal/],
    ['a spread', '@model({ settings: { ...base, defaultLimit: 5 } })\nclass A {}\n', /spread/],
    [
      'a computed key',
      '@model({ settings: { [key]: 1, defaultLimit: 5 } })\nclass A {}\n',
      /computed key/,
    ],
    [
      'a scopeFilter variable',
      '@model({ settings: { scopeFilter: cfg } })\nclass A {}\n',
      /scopeFilter is not an object literal/,
    ],
    [
      'a scopeFilter spread',
      '@model({ settings: { scopeFilter: { ...cfg, resolve } } })\nclass A {}\n',
      /scopeFilter contains a spread/,
    ],
    ['a shorthand old key', '@model({ settings: { defaultLimit } })\nclass A {}\n', /shorthand/],
    [
      'a non-literal query',
      '@model({ settings: { query: q, defaultLimit: 5 } })\nclass A {}\n',
      /query is not an object literal/,
    ],
  ])('%s is reported with its line and left untouched', (_name, source, pattern) => {
    const result = run(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]?.reason).toMatch(pattern);
    expect(result.reports[0]?.line).toBeGreaterThan(0);
  });

  test('@model(options) with a variable argument is reported, not skipped', () => {
    const source = '@model(options)\nclass A {}\n';
    const result = run(source);

    expect(result.changed).toBe(false);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]?.reason).toMatch(/@model argument is not an object literal/);
  });

  test('an aliased import of model from IGNIS is migrated like model', () => {
    const source =
      "import { model as m } from '@venizia/ignis';\n@m({ settings: { defaultLimit: 5 } })\nclass A {}\n";
    const result = run(source);

    expect(result.rewritten).toBe(1);
    expect(result.output).toContain('query: { limit: { default: 5 } }');
  });

  test('model reached through a namespace import of IGNIS is migrated', () => {
    const source =
      "import * as ignis from '@venizia/ignis-kernel';\n@ignis.model({ settings: { maxLimit: 9 } })\nclass A {}\n";
    const result = run(source);

    expect(result.rewritten).toBe(1);
    expect(result.output).toContain('query: { limit: { max: 9 } }');
  });

  test('an alias that does not come from IGNIS is not a model decorator', () => {
    const source =
      "import { model as m } from './mine';\n@m({ settings: { defaultLimit: 5 } })\nclass A {}\n";
    const result = run(source);

    expect(result.changed).toBe(false);
    expect(result.reports).toHaveLength(0);
  });

  test('an untouched model does not stop the next model in the file', () => {
    const result = run(`@model({ settings: s })\nclass A {}\n${model('{ defaultLimit: 4 }')}`);

    expect(result.rewritten).toBe(1);
    expect(result.reports).toHaveLength(1);
    expect(result.output).toContain('query: { limit: { default: 4 } }');
  });

  test('a model already on the new shape, or with no settings, is left alone', () => {
    expect(run(model('{ query: { limit: { default: 3 } }, access: { resolve } }')).changed).toBe(
      false,
    );
    expect(run("@model({ type: 'entity' })\nclass A {}\n").changed).toBe(false);
    expect(run('class A { defaultLimit = 3; }\n').changed).toBe(false);
  });

  test('an object that is not a @model argument is not touched', () => {
    const source = 'const config = { settings: { defaultLimit: 5 } };\n';

    expect(run(source).changed).toBe(false);
  });
});

describe('migrateModelSettings - idempotence', () => {
  test.each([
    '{ defaultFilter: { where: {} }, defaultLimit: 1, maxLimit: 2, scopeFilter: { resolve, writeGuard: "assign", sharedRows: true } }',
    '{ query: { limit: { max: 9 } }, defaultLimit: 5 }',
    "{ hiddenProperties: ['x'], maxLimit: 3 }",
  ])('running twice changes nothing the second time: %s', (settings) => {
    const first = run(model(settings));
    const second = run(first.output);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.output).toBe(first.output);
  });

  test('the output parses', () => {
    const output = migrated(
      "{ defaultFilter: { where: {} }, defaultLimit: 1, scopeFilter: { resolve, writeGuard: 'assign' } }",
    );
    const file = ts.createSourceFile('x.ts', output, ts.ScriptTarget.Latest, true);

    expect((file as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics).toHaveLength(0);
  });
});

describe('devz codemod model-settings - the command', () => {
  let root: string;
  let logs: string[];
  let warnings: string[];

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'codemod-'));
    // The fixture is its own repository, so git lists the files the command may touch.
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'node_modules/pkg'), { recursive: true });
    logs = [];
    warnings = [];
    spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    spyOn(console, 'warn').mockImplementation((...args) => {
      warnings.push(args.join(' '));
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const write = (path: string, content: string) => writeFileSync(join(root, path), content);
  const read = (path: string) => readFileSync(join(root, path), 'utf8');

  test('--check lists what would change, writes nothing, and exits 1', async () => {
    write('src/a.model.ts', model('{ defaultLimit: 5 }'));

    const code = await CodemodCommand.run({ root, args: ['model-settings', '--check'] });

    expect(code).toBe(1);
    expect(read('src/a.model.ts')).toBe(model('{ defaultLimit: 5 }'));
    expect(logs.join('\n')).toContain('would change');
    expect(logs.join('\n')).toContain('src/a.model.ts');
  });

  test('--check exits 1 when the only findings are left-untouched models', async () => {
    write('src/a.model.ts', '@model({ settings: shared })\nclass A {}\n');

    const code = await CodemodCommand.run({ root, args: ['model-settings', '--check'] });

    expect(code).toBe(1);
    expect(warnings.join('\n')).toContain('left untouched');
    expect(logs.join('\n')).toContain('fix them by hand');
  });

  test('--check reports @model(options) and an aliased decorator', async () => {
    write('src/a.model.ts', '@model(options)\nclass A {}\n');
    write(
      'src/b.model.ts',
      "import { model as m } from '@venizia/ignis';\n@m({ settings: { defaultLimit: 5 } })\nclass B {}\n",
    );

    const code = await CodemodCommand.run({ root, args: ['model-settings', '--check'] });

    expect(code).toBe(1);
    expect(warnings.join('\n')).toContain('@model argument is not an object literal');
    expect(logs.join('\n')).toContain('src/b.model.ts');
  });

  test('without --check, left-untouched models do not change the exit code', async () => {
    write('src/a.model.ts', '@model({ settings: shared })\nclass A {}\n');

    expect(await CodemodCommand.run({ root, args: ['model-settings'] })).toBe(0);
    expect(await CodemodCommand.run({ root, args: ['model-settings', '--write'] })).toBe(0);
  });

  test('--check exits 0 when nothing would change', async () => {
    write('src/a.model.ts', model('{ query: { limit: { default: 5 } } }'));

    expect(await CodemodCommand.run({ root, args: ['model-settings', '--check'] })).toBe(0);
  });

  test('without --write it is a dry run: lists the change, writes nothing, exits 0', async () => {
    write('src/a.model.ts', model('{ defaultLimit: 5 }'));

    expect(await CodemodCommand.run({ root, args: ['model-settings'] })).toBe(0);

    expect(read('src/a.model.ts')).toBe(model('{ defaultLimit: 5 }'));
    expect(logs.join('\n')).toContain('would change');
    expect(logs.join('\n')).toContain('--write');
  });

  test('--write writes the files and exits 0; a second run changes nothing', async () => {
    write('src/a.model.ts', model('{ defaultLimit: 5 }'));

    expect(await CodemodCommand.run({ root, args: ['model-settings', '--write'] })).toBe(0);
    expect(read('src/a.model.ts')).toBe(model('{ query: { limit: { default: 5 } } }'));

    expect(await CodemodCommand.run({ root, args: ['model-settings', '--check'] })).toBe(0);
  });

  test('paths limit the run to those files or folders', async () => {
    mkdirSync(join(root, 'other'));
    write('src/a.model.ts', model('{ defaultLimit: 5 }'));
    write('other/b.model.ts', model('{ defaultLimit: 6 }'));

    await CodemodCommand.run({ root, args: ['model-settings', 'src', '--write'] });

    expect(read('src/a.model.ts')).toContain('query:');
    expect(read('other/b.model.ts')).toBe(model('{ defaultLimit: 6 }'));
  });

  test('node_modules, declaration files and files without @model are skipped', async () => {
    write('node_modules/pkg/index.ts', model('{ defaultLimit: 5 }'));
    write('src/types.d.ts', model('{ defaultLimit: 5 }'));
    write('src/plain.ts', 'export const settings = { defaultLimit: 5 };\n');

    expect(await CodemodCommand.run({ root, args: ['model-settings', '--check'] })).toBe(0);
  });

  test('untouched cases are printed with file, line and column', async () => {
    write('src/a.model.ts', '\n@model({ settings: shared })\nclass A {}\n');

    await CodemodCommand.run({ root, args: ['model-settings'] });

    expect(warnings.join('\n')).toMatch(
      /src\/a\.model\.ts:2:\d+ {2}settings is not an object literal/,
    );
    expect(logs.join('\n')).toContain('1 left untouched');
  });

  test('a git-ignored folder is never entered, even with --write', async () => {
    mkdirSync(join(root, '.agents/local/worktrees/other/src'), { recursive: true });
    mkdirSync(join(root, 'generated'));
    write('.gitignore', '.agents/local/\ngenerated/\n');
    write('.agents/local/worktrees/other/src/a.model.ts', model('{ defaultLimit: 5 }'));
    write('generated/b.model.ts', model('{ defaultLimit: 6 }'));
    write('src/c.model.ts', model('{ defaultLimit: 7 }'));

    expect(await CodemodCommand.run({ root, args: ['model-settings', '--write'] })).toBe(0);

    expect(read('.agents/local/worktrees/other/src/a.model.ts')).toBe(model('{ defaultLimit: 5 }'));
    expect(read('generated/b.model.ts')).toBe(model('{ defaultLimit: 6 }'));
    expect(read('src/c.model.ts')).toContain('query:');
  });

  test('a nested repository that is not ignored is not entered either', async () => {
    mkdirSync(join(root, 'vendor/src'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: join(root, 'vendor') });
    write('vendor/src/a.model.ts', model('{ defaultLimit: 5 }'));

    expect(await CodemodCommand.run({ root, args: ['model-settings', '--write'] })).toBe(0);

    expect(read('vendor/src/a.model.ts')).toBe(model('{ defaultLimit: 5 }'));
  });

  test('--help prints the usage, exits 0 and writes nothing', async () => {
    write('src/a.model.ts', model('{ defaultLimit: 5 }'));

    for (const args of [
      ['model-settings', '--help'],
      ['--help'],
      ['model-settings', '-h', '--write'],
    ]) {
      logs.length = 0;
      expect(await CodemodCommand.run({ root, args })).toBe(0);
      expect(logs.join('\n')).toContain('Usage: devz codemod model-settings');
    }

    expect(read('src/a.model.ts')).toBe(model('{ defaultLimit: 5 }'));
  });

  test('an unknown flag is an error (exit 2) and nothing is written', async () => {
    const errors: string[] = [];
    spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });
    write('src/a.model.ts', model('{ defaultLimit: 5 }'));

    for (const flag of ['--halp', '--dry-run', '-w']) {
      expect(await CodemodCommand.run({ root, args: ['model-settings', flag, '--write'] })).toBe(2);
    }

    expect(errors.join('\n')).toContain('unknown option "--halp"');
    expect(read('src/a.model.ts')).toBe(model('{ defaultLimit: 5 }'));
  });

  test('--write and --check together are refused and nothing is written', async () => {
    spyOn(console, 'error').mockImplementation(() => {});
    write('src/a.model.ts', model('{ defaultLimit: 5 }'));

    expect(await CodemodCommand.run({ root, args: ['model-settings', '--write', '--check'] })).toBe(
      2,
    );
    expect(read('src/a.model.ts')).toBe(model('{ defaultLimit: 5 }'));
  });

  test('outside git the walk skips dot-directories, node_modules, dist and build', () => {
    for (const directory of ['.agents/x', 'node_modules/x', 'dist', 'build', 'lib']) {
      mkdirSync(join(root, directory), { recursive: true });
      write(join(directory, 'a.model.ts'), model('{ defaultLimit: 5 }'));
    }

    const files = CodemodFiles.fromWalk({ target: root }).map((file) =>
      file.slice(root.length + 1),
    );

    expect(files).toEqual(['lib/a.model.ts']);
  });

  test('an unknown codemod is refused', async () => {
    const errors: string[] = [];
    spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });

    expect(await CodemodCommand.run({ root, args: ['nope'] })).toBe(2);
    expect(errors.join('\n')).toContain('Usage: devz codemod model-settings');
  });
});

describe('migrateModelSettings - skipMigrate', () => {
  const skip = (metadata: string) => `@model({ ${metadata} })\nclass Product {}\n`;

  test('skipMigrate: true becomes migration: { use: false }', () => {
    expect(run(skip('skipMigrate: true')).output).toBe(skip('migration: { use: false }'));
  });

  test('skipMigrate: false is the default and is removed', () => {
    expect(run(skip("type: 'entity', skipMigrate: false")).output).toBe(skip("type: 'entity'"));
    expect(run(skip('skipMigrate: false')).output).toBe('@model({ })\nclass Product {}\n');
  });

  test('it works beside the settings in the same decorator, and keeps the other keys', () => {
    const result = run(skip("type: 'entity', skipMigrate: true, settings: { defaultLimit: 5 }"));

    expect(result.rewritten).toBe(2);
    expect(result.output).toBe(
      skip(
        "type: 'entity', migration: { use: false }, settings: { query: { limit: { default: 5 } } }",
      ),
    );
  });

  test('the comment above it stays', () => {
    const result = run(`@model({
  // created by hand
  skipMigrate: true,
})
class Product {}
`);

    expect(result.output).toContain('// created by hand');
    expect(result.output).toContain('migration: { use: false }');
  });

  test.each([
    ['a variable', 'skipMigrate: shouldSkip', /not a boolean literal/],
    ['a shorthand', 'skipMigrate', /shorthand/],
    ['an existing migration', 'skipMigrate: true, migration: { use: false }', /both set/],
  ])('%s is reported and left untouched', (_name, metadata, pattern) => {
    const source = skip(metadata);
    const result = run(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
    expect(result.reports[0]?.reason).toMatch(pattern);
  });

  test('running it twice changes nothing the second time', () => {
    const first = run(skip('skipMigrate: true'));

    expect(run(first.output).changed).toBe(false);
  });

  test('a model that never set it is left alone', () => {
    expect(run(skip("type: 'entity'")).changed).toBe(false);
  });
});

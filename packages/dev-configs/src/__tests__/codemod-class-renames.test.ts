import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { ClassRenameTable, ClassRenames } from '../cli/codemod/class-renames';

const rewrite = (source: string, reverse = false) =>
  ClassRenames.rewrite({ typescript: ts, fileName: 'file.ts', source, reverse });

describe('devz codemod class-renames: the rewrite', () => {
  test('the import and every use are renamed, in code and in types', () => {
    const result = rewrite(
      [
        `import { RejectionHelper, other } from '@venizia/dev-configs/testing';`,
        `const error = await RejectionHelper.rejectionOf({ task });`,
        `type T = typeof RejectionHelper;`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `import { RejectionUtility, other } from '@venizia/dev-configs/testing';`,
        `const error = await RejectionUtility.rejectionOf({ task });`,
        `type T = typeof RejectionUtility;`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(3);
  });

  test('every row of the table renames from its own package, sub-paths included', () => {
    for (const row of ClassRenameTable.ROWS) {
      const specifier = `${row.packages[0]}/core`;
      const result = rewrite(
        `import { ${row.oldName} } from '${specifier}';\n${row.oldName}.x();\n`,
      );

      expect(result.output).toBe(
        `import { ${row.newName} } from '${specifier}';\n${row.newName}.x();\n`,
      );
    }
  });

  test('an aliased import keeps its alias and changes only the imported name', () => {
    const result = rewrite(
      `import { RetryHelper as Retry } from '@venizia/ignis-helpers';\nRetry.executeWithRetry();\n`,
    );

    expect(result.output).toBe(
      `import { RetryUtility as Retry } from '@venizia/ignis-helpers';\nRetry.executeWithRetry();\n`,
    );
  });

  test('a namespace member and a re-export are renamed', () => {
    const result = rewrite(
      [
        `import * as helpers from '@venizia/ignis-helpers';`,
        `export { SlugHelper } from '@venizia/ignis-helpers';`,
        `helpers.SlugHelper.slugify({ value: 'a' });`,
        `type S = helpers.SlugHelper;`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `import * as helpers from '@venizia/ignis-helpers';`,
        `export { SlugUtility } from '@venizia/ignis-helpers';`,
        `helpers.SlugUtility.slugify({ value: 'a' });`,
        `type S = helpers.SlugUtility;`,
        '',
      ].join('\n'),
    );
  });

  test('the same name from another package, and a property of that name, are left alone', () => {
    const source = [
      `import { SlugHelper } from 'somewhere-else';`,
      `import { RetryHelper } from '@venizia/ignis-helpers';`,
      `const config = { RetryHelper: 1 };`,
      `config.RetryHelper;`,
      '',
    ].join('\n');
    const result = rewrite(source);

    expect(result.output).toBe(
      [
        `import { SlugHelper } from 'somewhere-else';`,
        `import { RetryUtility } from '@venizia/ignis-helpers';`,
        `const config = { RetryHelper: 1 };`,
        `config.RetryHelper;`,
        '',
      ].join('\n'),
    );
  });

  test('a file with no import of a renamed class is not changed', () => {
    const source = `const RetryHelper = 1;\nexport { RetryHelper };\n`;

    expect(rewrite(source)).toEqual({ output: source, changed: false, rewritten: 0 });
  });

  test('--reverse renames the new names back', () => {
    const result = rewrite(
      `import { SpawnUtility } from '@venizia/dev-configs/testing';\nSpawnUtility.spawnSyncBounded({ cmd: [] });\n`,
      true,
    );

    expect(result.output).toBe(
      `import { SpawnHelper } from '@venizia/dev-configs/testing';\nSpawnHelper.spawnSyncBounded({ cmd: [] });\n`,
    );
  });
});

describe('devz codemod class-renames: the command', () => {
  let directory: string;
  let log: ReturnType<typeof spyOn>;
  let warn: ReturnType<typeof spyOn>;

  beforeEach(() => {
    directory = mkdtempSync(join(process.env.TMPDIR ?? '.', 'class-renames-'));
    execFileSync('git', ['init', '-q'], { cwd: directory });
    mkdirSync(join(directory, 'src'));
    writeFileSync(
      join(directory, 'src', 'a.ts'),
      `import { SlugHelper } from '@venizia/ignis-helpers';\nSlugHelper.slugify({ value: 'x' });\n`,
    );
    execFileSync('git', ['add', '-A'], { cwd: directory });
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
      { cwd: directory },
    );
    log = spyOn(console, 'log').mockImplementation(() => {});
    warn = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
    warn.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  });

  test('a dry run writes nothing, --check exits 1, --write changes the file', async () => {
    const file = join(directory, 'src', 'a.ts');
    const before = readFileSync(file, 'utf8');

    const result = await CodemodCommand.run({ root: directory, args: ['class-renames', 'src'] });
    expect(result).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(before);
    const result2 = await CodemodCommand.run({
      root: directory,
      args: ['class-renames', 'src', '--check'],
    });
    expect(result2).toBe(1);
    const result3 = await CodemodCommand.run({
      root: directory,
      args: ['class-renames', 'src', '--write'],
    });
    expect(result3).toBe(0);
    expect(readFileSync(file, 'utf8')).toContain('SlugUtility.slugify');
  });

  test('--write with no path is refused', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {});

    const result4 = await CodemodCommand.run({
      root: directory,
      args: ['class-renames', '--write'],
    });
    expect(result4).toBe(2);

    error.mockRestore();
  });
});

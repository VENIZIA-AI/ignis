import { describe, expect, test } from 'bun:test';
import ts from 'typescript';
import { ClassRenames } from '../cli/codemod/class-renames';
import { ExecutionClassTable } from '../cli/codemod/execution-class';

const rewrite = (lines: string[], reverse = false) =>
  ClassRenames.rewrite({
    typescript: ts,
    fileName: 'file.ts',
    source: lines.join('\n'),
    rows: ExecutionClassTable.ROWS,
    reverse,
  }).output.split('\n');

describe('devz codemod execution-class', () => {
  test('the class and the two renamed methods, from every package that exports it', () => {
    for (const specifier of [
      '@venizia/ignis-helpers',
      '@venizia/ignis-helpers/core',
      '@venizia/ignis',
    ]) {
      expect(
        rewrite([
          `import { PromiseUtility, getError } from '${specifier}';`,
          'await PromiseUtility.sleep({ ms: 1 });',
          'await PromiseUtility.executeWithLimit({ tasks, limit: 2 });',
          'PromiseUtility.voidExecution({ scope, execution });',
          'const other = queue.executeWithLimit();',
        ]),
      ).toEqual([
        `import { Execution, getError } from '${specifier}';`,
        'await Execution.sleep({ ms: 1 });',
        'await Execution.withLimit({ tasks, limit: 2 });',
        'Execution.fireAndForget({ scope, execution });',
        'const other = queue.executeWithLimit();',
      ]);
    }
  });

  test('an aliased import keeps its alias, and its methods are renamed', () => {
    expect(
      rewrite([
        `import { PromiseUtility as P } from '@venizia/ignis-helpers';`,
        'P.voidExecution({ scope, execution });',
      ]),
    ).toEqual([
      `import { Execution as P } from '@venizia/ignis-helpers';`,
      'P.fireAndForget({ scope, execution });',
    ]);
  });

  test('a namespace import and a type import', () => {
    expect(
      rewrite([
        `import * as helpers from '@venizia/ignis-helpers';`,
        `import type { PromiseUtility } from '@venizia/ignis';`,
        'helpers.PromiseUtility.executeWithLimit({ tasks, limit: 1 });',
        'let sleep: typeof PromiseUtility.sleep;',
      ]),
    ).toEqual([
      `import * as helpers from '@venizia/ignis-helpers';`,
      `import type { Execution } from '@venizia/ignis';`,
      'helpers.Execution.withLimit({ tasks, limit: 1 });',
      'let sleep: typeof Execution.sleep;',
    ]);
  });

  test('a file that already uses the name Execution gets the import aliased', () => {
    expect(
      rewrite([
        `import { PromiseUtility } from '@venizia/ignis-helpers';`,
        'class Execution {}',
        'PromiseUtility.voidExecution({ scope, execution });',
      ]),
    ).toEqual([
      `import { Execution as IgnisExecution } from '@venizia/ignis-helpers';`,
      'class Execution {}',
      'IgnisExecution.fireAndForget({ scope, execution });',
    ]);
  });

  test("another package's PromiseUtility is left alone, and a second run changes nothing", () => {
    const own = [`import { PromiseUtility } from './local';`, 'PromiseUtility.voidExecution({});'];
    const once = rewrite([
      `import { PromiseUtility } from '@venizia/ignis-helpers';`,
      'PromiseUtility.sleep({ ms: 1 });',
    ]);

    expect(rewrite(own)).toEqual(own);
    expect(rewrite(once)).toEqual(once);
  });

  test('--reverse restores the old names', () => {
    expect(
      rewrite(
        [
          `import { Execution } from '@venizia/ignis-helpers';`,
          'Execution.withLimit({ tasks, limit: 1 });',
        ],
        true,
      ),
    ).toEqual([
      `import { PromiseUtility } from '@venizia/ignis-helpers';`,
      'PromiseUtility.executeWithLimit({ tasks, limit: 1 });',
    ]);
  });
});

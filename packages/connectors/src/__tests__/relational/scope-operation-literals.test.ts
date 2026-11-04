import { describe, expect, test } from 'bun:test';
import { ScopeOperations } from '@venizia/ignis-kernel';
import { join } from 'node:path';

const CONNECTORS_ROOT = join(import.meta.dir, '../../..');

/** The row-scope code: every file that passes, receives or compares a scope operation. */
const ROW_SCOPE_FILES = [
  'src/common/scope-filter.ts',
  'src/relational/core/repositories/common/scope-filter.ts',
  'src/relational/core/repositories/common/scope-write-guard.ts',
  'src/relational/core/repositories/core/base.ts',
  'src/relational/core/repositories/core/persistable.ts',
  'src/relational/core/repositories/core/readable.ts',
  'src/relational/core/repositories/core/soft-deletable.ts',
  'src/relational/core/repositories/dialect/filter.ts',
];

/** Comments name the operations in prose; only code may not spell them. */
const stripComments = (opts: { source: string }): string => {
  return opts.source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
};

/** One quoted word, in any of the three quote styles. */
const toLiteralPattern = (opts: { values: Iterable<string> }): RegExp => {
  return new RegExp(`(['"\`])(${[...opts.values].join('|')})\\1`, 'g');
};

describe('the row-scope code spells no scope operation as a string literal', () => {
  const pattern = toLiteralPattern({ values: ScopeOperations.SCHEME_SET });

  for (const file of ROW_SCOPE_FILES) {
    test(`${file} names ScopeOperations members only`, async () => {
      const source = await Bun.file(join(CONNECTORS_ROOT, file)).text();
      const found = [...stripComments({ source }).matchAll(pattern)].map((match) => match[0]);

      expect(found).toEqual([]);
    });
  }

  test('positive control: the scan sees a literal in code and ignores one in a comment', () => {
    const code =
      "const op = 'update'; // 'delete' in a comment\n/* 'create' */ const x = \"read\";";
    const found = [...stripComments({ source: code }).matchAll(pattern)].map((match) => match[0]);

    expect(found).toEqual(["'update'", '"read"']);
  });
});

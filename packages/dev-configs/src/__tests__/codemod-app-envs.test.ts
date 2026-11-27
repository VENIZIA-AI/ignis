import { describe, expect, test } from 'bun:test';
import ts from 'typescript';
import { ClassRenames } from '../cli/codemod/class-renames';

const rewrite = (lines: string[], reverse = false) =>
  ClassRenames.rewrite({
    typescript: ts,
    fileName: 'file.ts',
    source: lines.join('\n'),
    reverse,
  }).output.split('\n');

describe('devz codemod class-renames: applicationEnvironment is AppEnvs', () => {
  test('renames the import and every use, from both packages and sub-paths', () => {
    for (const from of ['@venizia/ignis-helpers', '@venizia/ignis', '@venizia/ignis-helpers/env']) {
      expect(
        rewrite([
          `import { applicationEnvironment, getError } from '${from}';`,
          `const a = applicationEnvironment.get('A');`,
          `const b = { applicationEnvironment };`,
        ]),
      ).toEqual([
        `import { AppEnvs, getError } from '${from}';`,
        `const a = AppEnvs.get('A');`,
        `const b = { applicationEnvironment: AppEnvs };`,
      ]);
    }
  });

  test('keeps an alias', () => {
    expect(
      rewrite([
        `import { applicationEnvironment as env } from '@venizia/ignis-helpers';`,
        `env.get('A');`,
      ]),
    ).toEqual([`import { AppEnvs as env } from '@venizia/ignis-helpers';`, `env.get('A');`]);
  });

  test.each([
    ['first', 'applicationEnvironment, AppEnvs, getError', 'AppEnvs, getError'],
    ['last', 'getError, AppEnvs, applicationEnvironment', 'getError, AppEnvs'],
  ])('a file that imports both names imports one, old name %s', (_, before, after) => {
    expect(
      rewrite([
        `import { ${before} } from '@venizia/ignis-helpers';`,
        `applicationEnvironment.get('A');`,
        `AppEnvs.get('B');`,
      ]),
    ).toEqual([
      `import { ${after} } from '@venizia/ignis-helpers';`,
      `AppEnvs.get('A');`,
      `AppEnvs.get('B');`,
    ]);
  });

  test('an import left with no name goes', () => {
    expect(
      rewrite([
        `import { AppEnvs } from '@venizia/ignis-helpers';`,
        `import { applicationEnvironment } from '@venizia/ignis-helpers';`,
        `applicationEnvironment.get('A');`,
      ]),
    ).toEqual([`import { AppEnvs } from '@venizia/ignis-helpers';`, `AppEnvs.get('A');`]);
  });

  test('another module keeps its own applicationEnvironment', () => {
    const lines = [
      `import { applicationEnvironment } from './env';`,
      `applicationEnvironment.get('A');`,
    ];

    expect(rewrite(lines)).toEqual(lines);
  });

  test('--reverse leaves AppEnvs: the release before exports it too', () => {
    const lines = [`import { AppEnvs } from '@venizia/ignis-helpers';`, `AppEnvs.get('A');`];

    expect(rewrite(lines, true)).toEqual(lines);
  });
});

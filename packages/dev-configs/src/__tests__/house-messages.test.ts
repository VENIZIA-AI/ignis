import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import { houseConfigs } from '../linters/house';
import { NoRestrictedPropertiesRule } from '../linters/rules';

/** A lint message says what to use and writes the line that imports it. */
describe('house messages write the framework import line', () => {
  const messageOf = (opts: { ruleId: string; code: string }) =>
    new Linter()
      .verify(opts.code, houseConfigs, { filename: 'src/subject.ts' })
      .find((finding) => finding.ruleId === opts.ruleId)?.message;

  test.each([
    [
      '@venizia/no-new-error',
      `export const fail = () => new Error('x');`,
      `import { getError } from '@venizia/ignis-helpers/core';`,
    ],
    [
      '@venizia/const-class-values',
      `export type TMode = 'read' | 'write';`,
      `import { ConstClass, type TConstValue } from '@venizia/ignis-helpers/common';`,
    ],
    [
      '@venizia/no-silent-catch',
      `export const f = (g: () => void) => { try { g(); } catch {} };`,
      `import { LoggerFactory } from '@venizia/ignis-helpers/core';`,
    ],
    [
      '@venizia/no-silent-catch',
      `export const f = (p: Promise<void>) => p.catch(() => null);`,
      `import { LoggerFactory } from '@venizia/ignis-helpers/core';`,
    ],
  ])('%s', (ruleId, code, importLine) => {
    expect(messageOf({ ruleId, code })).toContain(importLine);
  });

  test('no-silent-catch does not offer an eslint-disable', () => {
    const message = messageOf({
      ruleId: '@venizia/no-silent-catch',
      code: `export const f = (g: () => void) => { try { g(); } catch {} };`,
    });

    expect(message).not.toContain('eslint-disable');
  });

  test('randomUUID names the generator and its import', () => {
    expect(NoRestrictedPropertiesRule.SECURE_CONTEXT[0]?.message).toContain(
      `import { UuidV4Generator } from '@venizia/ignis-helpers/uuid';`,
    );
  });
});

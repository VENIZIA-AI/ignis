import { describe, expect, test } from 'bun:test';
import ts from 'typescript';
import { EnvGet } from '../cli/codemod/env-get';

const rewrite = (source: string, fileName = 'file.ts') =>
  EnvGet.rewrite({ typescript: ts, fileName, source });

describe('devz codemod env-get: the rewrite', () => {
  test('get<string> loses its type argument, with or without options', () => {
    const result = rewrite(
      [
        `const a = applicationEnvironment.get<string>(KEY);`,
        `const b = AppEnvs.get<string>(KEY, { defaultValue: 'x' });`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `const a = applicationEnvironment.get(KEY);`,
        `const b = AppEnvs.get(KEY, { defaultValue: 'x' });`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(2);
    expect(result.manual).toEqual([]);
  });

  test('get<R, B> keeps R only', () => {
    const result = rewrite(
      `const n = applicationEnvironment.get<number | undefined, string>(KEY, { transform });\n`,
    );

    expect(result.output).toBe(
      `const n = applicationEnvironment.get<number | undefined>(KEY, { transform });\n`,
    );
  });

  test('another type argument is listed as manual and left alone', () => {
    const source = `\nconst t = applicationEnvironment.get<number>(KEY);\n`;
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
    expect(result.manual).toEqual([2]);
  });

  test('a get on another receiver is not touched', () => {
    const source = `const s = container.get<string>({ key });\n`;

    expect(rewrite(source).changed).toBe(false);
  });

  test('a call with no type argument is not touched', () => {
    expect(rewrite(`const s = applicationEnvironment.get(KEY);\n`).changed).toBe(false);
  });
});

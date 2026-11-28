import { describe, expect, test } from 'bun:test';
import ts from 'typescript';
import { AsyncContextRemoval } from '../cli/codemod/async-context';

const rewrite = (source: string) =>
  AsyncContextRemoval.rewrite({ typescript: ts, fileName: 'file.ts', source });

describe('devz codemod async-context', () => {
  test('the key goes with its line, whatever its value', () => {
    for (const value of ['{ enable: true }', '{ enable: false }', '{ enable: isOn }']) {
      const { output } = rewrite(
        ['const config = {', '  port: 1,', `  asyncContext: ${value},`, '  debug: {},', '};'].join(
          '\n',
        ),
      );

      expect(output).toBe(['const config = {', '  port: 1,', '  debug: {},', '};'].join('\n'));
    }
  });

  test('the key inside a one-line object, and as its last or only member', () => {
    expect(rewrite('const a = { asyncContext: { enable: true }, port: 1 };').output).toBe(
      'const a = { port: 1 };',
    );
    expect(rewrite('const b = { port: 1, asyncContext: { enable: true } };').output).toBe(
      'const b = { port: 1 };',
    );
    expect(
      rewrite('const c: IApplicationConfigs = { asyncContext: { enable: true } };').output,
    ).toBe('const c: IApplicationConfigs = {};');
  });

  test('another object under that name is left alone, and a second run changes nothing', () => {
    const other =
      'const a = { asyncContext: { enable: true, store } };\nconst b = { asyncContext: 1 };';
    const once = rewrite('const c = { port: 1, asyncContext: { enable: true } };').output;

    expect(rewrite(other).output).toBe(other);
    expect(rewrite(once).changed).toBe(false);
  });

  test('an override of the removed seam, and a read of the removed key, are listed by line', () => {
    const source = [
      'class App {',
      '  protected override getDefaultAsyncContextEnabled(): boolean { return true; }',
      '  read() { return this.configs.asyncContext?.enable; }',
      '}',
    ].join('\n');
    const result = rewrite(source);

    expect(result.output).toBe(source);
    expect(result.manual.map((entry) => entry.line)).toEqual([2, 3]);
  });

  test('the comment above the key goes with it', () => {
    const source = [
      'const a = {',
      '  port: 1,',
      '  // the request store',
      '  /* kept on */',
      '  asyncContext: { enable: true },',
      '};',
    ].join('\n');

    expect(rewrite(source).output).toBe(['const a = {', '  port: 1,', '};'].join('\n'));
  });

  for (const [name, source] of [
    ['a quoted key', "const a = { port: 1, 'asyncContext': { enable: true } };"],
    ['a quoted enable', "const a = { port: 1, asyncContext: { 'enable': true } };"],
    ['a shorthand', 'const a = { port: 1, asyncContext };'],
    ['a variable value', 'const a = { port: 1, asyncContext: store };'],
    ['an empty object', 'const a = { port: 1, asyncContext: {} };'],
    [
      "an object that is no application's config",
      'const tracer = { asyncContext: { enable: true } };',
    ],
  ] as const) {
    test(`${name} is left as written, and listed`, () => {
      const result = rewrite(source);

      expect(result.output).toBe(source);
      expect(result.manual.map((entry) => entry.line)).toEqual([1]);
    });
  }

  test('the config of an application is known by where it stands', () => {
    for (const source of [
      'new App({ scope, config: { asyncContext: { enable: true } } });',
      'const a = { asyncContext: { enable: true } } satisfies IApplicationConfigs;',
    ]) {
      expect(rewrite(source).output).not.toContain('asyncContext');
    }
  });
});

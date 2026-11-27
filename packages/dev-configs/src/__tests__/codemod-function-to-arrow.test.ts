import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import {
  ArrowSkipReasons,
  FunctionToArrow,
  type TArrowSkipReason,
} from '../cli/codemod/function-to-arrow';
import { CliOutput } from '../common/cli-output';

const rewrite = (source: string, fileName = 'src/a.ts') =>
  FunctionToArrow.rewrite({ typescript: ts, fileName, source });
const reasons = (source: string) => rewrite(source).skipped.map((entry) => entry.reason);

describe('devz codemod function-to-arrow: what it rewrites', () => {
  test.each([
    ['a function', 'function a() {\n  return 1;\n}\n', 'const a = () => {\n  return 1;\n};\n'],
    [
      'export, async, generics and a return type',
      'export async function pick<T extends object>(value: T): Promise<T> {\n  return value;\n}\n',
      'export const pick = async <T extends object>(value: T): Promise<T> => {\n  return value;\n};\n',
    ],
    [
      'its TSDoc and inner comments',
      '/** Adds. */\nfunction add(a: number, /* b */ b: number) {\n  // sum\n  return a + b;\n}\n',
      '/** Adds. */\nconst add = (a: number, /* b */ b: number) => {\n  // sum\n  return a + b;\n};\n',
    ],
    [
      'a nested function used after it',
      'export const run = () => {\n  function one() {\n    return 1;\n  }\n  return one();\n};\n',
      'export const run = () => {\n  const one = () => {\n    return 1;\n  };\n  return one();\n};\n',
    ],
    [
      'recursion',
      'function down(n: number): number {\n  return n === 0 ? 0 : down(n - 1);\n}\n',
      'const down = (n: number): number => {\n  return n === 0 ? 0 : down(n - 1);\n};\n',
    ],
    [
      'a type guard',
      'function isText(v: unknown): v is string {\n  return typeof v === "string";\n}\n',
      'const isText = (v: unknown): v is string => {\n  return typeof v === "string";\n};\n',
    ],
    [
      'an inner plain function with its own this',
      'function outer() {\n  return { name: "x", read: function () { return this.name; } };\n}\n',
      'const outer = () => {\n  return { name: "x", read: function () { return this.name; } };\n};\n',
    ],
  ])('%s', (_name, source, expected) => {
    const result = rewrite(source);

    expect(result.output).toBe(expected);
    expect(result.skipped).toEqual([]);
  });

  test('a generic in a .tsx file keeps the comma that makes it a type parameter', () => {
    expect(rewrite('function id<T>(v: T) {\n  return v;\n}\n', 'src/a.tsx').output).toBe(
      'const id = <T,>(v: T) => {\n  return v;\n};\n',
    );
  });

  test('two declarations with nothing between them stay two statements', () => {
    expect(rewrite('function a(){}function b(){}\n').output).toBe(
      'const a = () => {};const b = () => {};\n',
    );
  });

  test('a default parameter is kept as written', () => {
    expect(rewrite('function add(a: number, b = a + 1) {}\n').output).toBe(
      'const add = (a: number, b = a + 1) => {};\n',
    );
  });

  test('a .tsx type parameter that already has its comma gets no second one', () => {
    expect(rewrite('function id<T,>(v: T) {}\n', 'src/a.tsx').output).toBe(
      'const id = <T,>(v: T) => {};\n',
    );
  });

  test('a second run changes nothing', () => {
    const once = rewrite('function a() {}\n').output;

    expect(rewrite(once).output).toBe(once);
  });
});

describe('devz codemod function-to-arrow: what it only lists', () => {
  test.each<[string, string, TArrowSkipReason]>([
    ['used before it is declared', 'run();\nfunction run() {}\n', ArrowSkipReasons.HOISTED],
    [
      'used by an earlier function',
      'export const a = () => b();\nfunction b() {}\n',
      ArrowSkipReasons.HOISTED,
    ],
    [
      'called early through a hoisted function declared after it',
      'start();\nfunction late() {}\nfunction start() {\n  late();\n}\n',
      ArrowSkipReasons.HOISTED,
    ],
    [
      'read by a shorthand property before it',
      'export const handlers = { f };\nfunction f() {}\n',
      ArrowSkipReasons.HOISTED,
    ],
    ['a this parameter', 'function f(this: Window) {}\n', ArrowSkipReasons.THIS],
    ['exported before it', 'export { later };\nfunction later() {}\n', ArrowSkipReasons.HOISTED],
    [
      'an overload',
      'function f(a: string): void;\nfunction f(a: unknown) {}\n',
      ArrowSkipReasons.OVERLOAD,
    ],
    ['a declaration without a body', 'declare function g(): void;\n', ArrowSkipReasons.OVERLOAD],
    ['a generator', 'function* gen() {\n  yield 1;\n}\n', ArrowSkipReasons.GENERATOR],
    ['this', 'function who() {\n  return this;\n}\n', ArrowSkipReasons.THIS],
    ['arguments', 'function all() {\n  return arguments.length;\n}\n', ArrowSkipReasons.ARGUMENTS],
    ['new.target', 'function make() {\n  return new.target;\n}\n', ArrowSkipReasons.NEW_TARGET],
    ['a default export', 'export default function main() {}\n', ArrowSkipReasons.EXPORT_DEFAULT],
    [
      'used with new',
      'function Box() {}\nexport const c = new Box();\n',
      ArrowSkipReasons.CONSTRUCTED,
    ],
    [
      'its prototype is used',
      'function Old() {}\nOld.prototype.go = () => 1;\n',
      ArrowSkipReasons.CONSTRUCTED,
    ],
    [
      'an assertion signature',
      'function must(v: unknown): asserts v {\n  if (!v) {\n    throw v;\n  }\n}\n',
      ArrowSkipReasons.ASSERTION,
    ],
    [
      'merged with a namespace',
      'function ns() {}\nnamespace ns {\n  export const a = 1;\n}\n',
      ArrowSkipReasons.MERGED,
    ],
  ])('%s', (_name, source, reason) => {
    const result = rewrite(source);

    expect(result.output).toBe(source);
    expect(reasons(source)).toContain(reason);
  });

  test('a hoisted caller keeps what it calls, even two steps away', () => {
    const source =
      'start();\nfunction deep() {}\nfunction middle() {\n  deep();\n}\nfunction start() {\n  middle();\n}\n';

    expect(rewrite(source).output).toBe(source);
  });

  test('CRLF line ends stay', () => {
    expect(rewrite('export function a() {\r\n  return 1;\r\n}\r\n').output).toBe(
      'export const a = () => {\r\n  return 1;\r\n};\r\n',
    );
  });

  test('a second run over its own output changes nothing', () => {
    const first = rewrite('function a() {}\nfunction* b() {}\n').output;

    expect(rewrite(first).output).toBe(first);
  });

  test('a skipped function is listed with its name and line', () => {
    expect(rewrite('\nfunction* gen() {}\n').skipped).toEqual([
      { name: 'gen', line: 2, reason: ArrowSkipReasons.GENERATOR },
    ]);
  });
});

describe('devz codemod function-to-arrow: the command', () => {
  let root: string;
  let logs: string[];

  beforeEach(() => {
    root = mkdtempSync(join(process.env.TMPDIR ?? '.', 'function-to-arrow-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/a.ts'), 'function a() {}\nfunction* b() {}\n');
    execFileSync('git', ['add', '-A'], { cwd: root });
    logs = [];
    spyOn(CliOutput, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    spyOn(CliOutput, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const run = (...args: string[]) =>
    CodemodCommand.run({ root, args: ['function-to-arrow', ...args] });
  const read = () => readFileSync(join(root, 'src/a.ts'), 'utf8');

  test('a dry run is the default: it lists the change and the skip, and writes nothing', async () => {
    const result = await run('src');
    expect(result).toBe(0);
    expect(read()).toContain('function a() {}');
    expect(logs.join('\n')).toContain('would change  src/a.ts  (1 function(s))');
    expect(logs.join('\n')).toContain('src/a.ts:2  b  generator');
    const result2 = await run('src', '--dry-run');
    expect(result2).toBe(0);
  });

  test('--write rewrites, --check exits 1 while a change is left, --write needs a path', async () => {
    const result3 = await run('src', '--check');
    expect(result3).toBe(1);
    const result4 = await run('--write');
    expect(result4).toBe(2);
    const result5 = await run('src', '--write');
    expect(result5).toBe(0);
    expect(read()).toBe('const a = () => {};\nfunction* b() {}\n');
    const result6 = await run('src', '--check');
    expect(result6).toBe(0);
  });

  test('it has no downgrade, and --help names it', async () => {
    const result7 = await run('src', '--reverse');
    expect(result7).toBe(2);
    const result8 = await CodemodCommand.run({ root, args: ['--list'] });
    expect(result8).toBe(0);
    expect(logs.join('\n')).toContain('function-to-arrow');
  });
});

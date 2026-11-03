import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import { asyncStyleConfigs, houseConfigs } from '../linters/house';

const CONFIGS = [...houseConfigs, ...asyncStyleConfigs];
const INLINE = 'venizia/no-inline-await';
const RETURN = 'venizia/no-return-await';

/** The findings of `ruleId` on `code`, as if it lived in `filename`. */
const findings = (opts: { code: string; ruleId: string; filename?: string }) => {
  const { code, ruleId, filename = 'src/subject.ts' } = opts;
  return new Linter()
    .verify(code, CONFIGS, { filename })
    .filter((message) => message.ruleId === ruleId);
};

/** The code after ESLint applied every fix of the two rules (up to ten passes, as `eslint --fix` does). */
const fixed = (opts: { code: string; filename?: string }) =>
  new Linter().verifyAndFix(opts.code, CONFIGS, { filename: opts.filename ?? 'src/subject.ts' });

describe('venizia/no-inline-await: where an await is allowed', () => {
  test('a whole statement and a whole declaration initializer are silent', () => {
    const code = [
      'async function run() {',
      '  await first();',
      '  const one = await second();',
      '  const { two } = await third();',
      '  let [three] = await fourth();',
      '  for await (const entry of stream()) { void entry; }',
      '}',
    ].join('\n');

    expect(findings({ code, ruleId: INLINE })).toEqual([]);
  });

  test('every other position reports', () => {
    const positions = [
      'g(await f())',
      'g(...(await f()))',
      'const a = [await f()]',
      'const a = { key: await f() }',
      'const a = cond ? await f() : 1',
      'const a = (await f()) && b',
      'const a = b || (await f())',
      'const a = `x${await f()}`',
      'const a = (await f()).value',
      'x = await f()',
      '[x, y] = await f()',
      'const a = (await f()) as number',
      'const a = !(await f())',
      'if (await f()) { run() }',
      'if (!(await f())) { run() }',
      'throw await f()',
      'const a = (await import(name)).default',
    ];

    for (const position of positions) {
      const code = `async function run() {\n  let x; let y; const cond = true; const b = 1; const name = 'n';\n  ${position};\n}`;
      expect(findings({ code, ruleId: INLINE }).length, position).toBeGreaterThan(0);
    }
  });

  test("a returned await is no-return-await's, not this rule's", () => {
    const code = 'async function run() { return await f(); }\nconst arrow = async () => await f();';

    expect(findings({ code, ruleId: INLINE })).toEqual([]);
    expect(findings({ code, ruleId: RETURN })).toHaveLength(2);
  });

  test('return g(await f()) and return (await f()).x report', () => {
    const code = 'async function run() { if (a) { return g(await f()); } return (await f()).x; }';

    expect(findings({ code, ruleId: INLINE })).toHaveLength(2);
  });

  test('applies to test files too', () => {
    const code = "test('x', async () => { expect(await f()).toBe(1); });";

    expect(findings({ code, ruleId: INLINE, filename: 'src/x.test.ts' })).toHaveLength(1);
  });

  test('is silent without the opt-in configs', () => {
    const messages = new Linter().verify('async function run() { g(await f()); }', houseConfigs, {
      filename: 'src/subject.ts',
    });

    expect(messages.filter((message) => message.ruleId === INLINE)).toEqual([]);
  });
});

describe('venizia/no-inline-await: the fix', () => {
  const wrap = (body: string) => `async function run() {\n  ${body}\n}`;

  test('an expect(await f()) becomes a declaration and a plain expect', () => {
    const out = fixed({ code: wrap('expect(await f()).toBe(1);') });

    expect(out.output).toBe(wrap('const result = await f();\n  expect(result).toBe(1);'));
    expect(out.messages.filter((message) => message.ruleId === INLINE)).toEqual([]);
  });

  test('parentheses that only grouped the await go with it', () => {
    expect(fixed({ code: wrap('const a = (await f()).value;') }).output).toBe(
      wrap('const result = await f();\n  const a = result.value;'),
    );
    expect(fixed({ code: wrap('if (!(await f())) { run(); }') }).output).toBe(
      wrap('const result = await f();\n  if (!result) { run(); }'),
    );
  });

  test('a return is hoisted too', () => {
    expect(fixed({ code: wrap('return g(await f());') }).output).toBe(
      wrap('const result = await f();\n  return g(result);'),
    );
  });

  test('an assignment is hoisted', () => {
    expect(fixed({ code: wrap('let x;\n  x = await f();\n  return x;') }).output).toBe(
      wrap('let x;\n  const result = await f();\n  x = result;\n  return x;'),
    );
  });

  test('two awaits in two statements get two names, and never one already in use', () => {
    const out = fixed({
      code: wrap('g(await a());\n  g(await b());\n  const result = 1; void result;'),
    });

    expect(out.output).toContain('const result2 = await a();');
    expect(out.output).toContain('const result3 = await b();');
    expect(out.messages.filter((message) => message.ruleId === INLINE)).toEqual([]);
  });

  test('two awaits in one statement are both hoisted, in source order', () => {
    const out = fixed({ code: wrap('g(await a(), await b());') });

    expect(out.output).toBe(
      wrap('const result = await a();\n  const result2 = await b();\n  g(result, result2);'),
    );
  });

  test('is not made when something that does more than read runs before the await', () => {
    const code = wrap('g(first(), await f());');
    const out = fixed({ code });

    expect(out.output).toBe(code);
    expect(findings({ code, ruleId: INLINE })).toHaveLength(1);
  });

  test('is not made inside a branch, a loop test, an unbraced if or an arrow expression body', () => {
    const cases = [
      'const a = cond ? await f() : 1;',
      'const a = cond && (await f());',
      'while (await f()) { run(); }',
      'if (cond) g(await f());',
      'const handler = () => g(await f());',
      'a?.b(await f());',
    ];

    for (const body of cases) {
      const code = wrap(`const cond = true; const a0 = 1; ${body}`);
      const out = fixed({ code });

      expect(out.output, body).toBe(code);
      expect(findings({ code, ruleId: INLINE }).length, body).toBeGreaterThan(0);
    }
  });

  test('keeps the evaluation order when the earlier operands only read values', () => {
    const out = fixed({ code: wrap('g(a, this.b, `${c}`, await f());') });

    expect(out.output).toBe(wrap('const result = await f();\n  g(a, this.b, `${c}`, result);'));
  });
});

describe('venizia/no-return-await', () => {
  const wrap = (body: string) => `async function run() {\n  ${body}\n}`;

  test('return await outside a try is reported and becomes return f()', () => {
    const code = wrap('return await f();');

    expect(findings({ code, ruleId: RETURN })).toHaveLength(1);
    expect(fixed({ code }).output).toBe(wrap('return f();'));
  });

  test('return await inside try, catch and finally is reported and split in two lines', () => {
    for (const body of [
      'try { return await f(); } catch (error) { void error; }',
      'try { run(); } catch (error) { return await f(); }',
      'try { run(); } finally { return await f(); }',
    ]) {
      const out = fixed({ code: wrap(body) });

      expect(out.output, body).toContain('const result = await f();');
      expect(out.output, body).toContain('return result;');
      expect(
        out.messages.filter((message) => message.ruleId === RETURN),
        body,
      ).toEqual([]);
    }
  });

  test('an arrow whose body is an await loses it', () => {
    const code = 'const read = async () => await f();';

    expect(findings({ code, ruleId: RETURN })).toHaveLength(1);
    expect(fixed({ code }).output).toBe('const read = async () => f();');
  });

  test('the try of an outer function does not count for an inner function', () => {
    const code = wrap(
      'try { const inner = async () => { return await f(); }; void inner; } catch (error) { void error; }',
    );

    expect(fixed({ code }).output).toContain('return f();');
  });

  test('const r = await f(); return r; and a returned promise are silent', () => {
    const code = wrap('const r = await f(); return r;\n}\nasync function other() {\n  return f();');

    expect(findings({ code, ruleId: RETURN })).toEqual([]);
  });

  test('is silent without the opt-in configs', () => {
    const messages = new Linter().verify(
      'async function run() { return await f(); }',
      houseConfigs,
      {
        filename: 'src/subject.ts',
      },
    );

    expect(messages.filter((message) => message.ruleId === RETURN)).toEqual([]);
  });
});

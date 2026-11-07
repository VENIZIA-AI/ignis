import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import { houseConfigs } from '../linters/house';
import { PADDING_OFF } from './padding-off';

const CONFIGS = [...houseConfigs, PADDING_OFF];
const RULE = 'venizia/no-await-new-chain';

/** The findings of the rule on `code`, as if it lived in `filename`. */
const findings = (code: string, filename = 'src/subject.ts') =>
  new Linter().verify(code, CONFIGS, { filename }).filter((message) => message.ruleId === RULE);

/** The code after ESLint applied every fix of every house rule (up to ten passes, as `eslint --fix` does). */
const fixed = (code: string) =>
  new Linter().verifyAndFix(code, CONFIGS, { filename: 'src/subject.ts' });

/** A function body around a statement, so the statement is where real code has it. */
const inFunction = (statement: string) => `async function run() {\n  ${statement}\n}\n`;

describe('venizia/no-await-new-chain: what it reports', () => {
  test.each([
    ['an awaited method of a new instance', 'await new Runner({ a: 1 }).run({ b: 2 });'],
    ['an initializer', 'const text = await new Response(body).text();'],
    ['a let', 'let text = await new Response(body).text();'],
    ['a destructuring', 'const { rows } = await new Reader(path).read();'],
    ['a chain of calls', 'const token = await new SignJWT(claims).setIssuer(issuer).sign(key);'],
    ['a chain with a member read', 'const out = await new Builder().settings.apply();'],
    ['a namespaced class', 'const out = await new ns.Runner().run();'],
    ['a type assertion on the instance', 'const out = await (new Runner() as Base).run();'],
    ['a non-null on the instance', 'const out = await new Runner()!.run();'],
    ['an optional call', 'const out = await new Runner()?.run();'],
    ['a type assertion on the result', 'const out = (await new Runner().run()) as Result;'],
    ['an argument of another call', 'expect(await new Runner().run()).toBe(1);'],
    ['a returned await', 'return await new Runner().run();'],
    ['a method that is `then` on a class that is not Promise', 'await new Lazy().then(done);'],
    ['a class named in lower case', 'await new factory().build();'],
  ])('%s', (_name, statement) => {
    expect(findings(inFunction(statement)).length).toBeGreaterThanOrEqual(1);
  });

  test('every await in one function is reported once', () => {
    const code = inFunction(
      'await new A().one();\n  await new B().two();\n  const c = await new C().three();',
    );

    expect(findings(code)).toHaveLength(3);
  });

  test('it reports in a test file, an arrow function and a class method', () => {
    const arrow = 'const run = async () => {\n  await new Runner().run();\n};\n';
    const method = 'class A {\n  async go() {\n    await new Runner().run();\n  }\n}\n';

    expect(findings(arrow, 'src/__tests__/subject.test.ts')).toHaveLength(1);
    expect(findings(method)).toHaveLength(1);
  });

  test('the message names the way out', () => {
    const [message] = findings(inFunction('await new Runner().run();'));

    expect(message?.message).toContain('declare the instance first');
  });
});

describe('venizia/no-await-new-chain: what it leaves alone', () => {
  test.each([
    ['a new Promise', 'await new Promise((resolve) => setTimeout(resolve, 1));'],
    ['a new Promise with a type argument', 'await new Promise<void>((resolve) => resolve());'],
    [
      'a method of a new Promise: no-await-promise-chain owns it',
      'await new Promise((resolve) => resolve(1)).then(done);',
    ],
    ['a declared instance', 'const runner = new Runner();\n  await runner.run();'],
    ['a property read, no call', 'const value = await new Holder().promise;'],
    ['an awaited new, no method', 'const value = await new Thenable();'],
    ['a call that is not on an instance', 'await runner.run();'],
    ['a function call', 'await run(new Runner());'],
    ['an instance passed as an argument', 'await runner.run(new Options());'],
    ['an await inside the constructor arguments', 'const out = new Runner(await load());'],
    ['a method of the awaited result', 'const out = (await load()).run();'],
    ['a static method of a class', 'const out = await Runner.create();'],
    ['a new that is not awaited', 'const out = new Runner().run();'],
    ['Promise.all', 'await Promise.all([new Runner().run()]);'],
    ['a new inside a callback of an await', 'await run(async () => new Runner().run());'],
  ])('%s', (_name, statement) => {
    expect(findings(inFunction(statement))).toEqual([]);
  });
});

describe('venizia/no-await-new-chain: the fix', () => {
  test.each([
    [
      'a statement',
      'await new Runner({ a: 1 }).run({ b: 2 });',
      'const runner = new Runner({ a: 1 });\n  await runner.run({ b: 2 });',
    ],
    [
      'an initializer',
      'const text = await new Response(body).text();',
      'const response = new Response(body);\n  const text = await response.text();',
    ],
    [
      'a destructuring',
      'const { rows } = await new Reader(path).read();',
      'const reader = new Reader(path);\n  const { rows } = await reader.read();',
    ],
    [
      'a builder chain: the builder is declared, the last call is awaited',
      'const token = await new SignJWT(claims).setIssuer(issuer).sign(key);',
      'const signJWT = new SignJWT(claims).setIssuer(issuer);\n  const token = await signJWT.sign(key);',
    ],
    [
      'a namespaced class',
      'const out = await new ns.Runner().run();',
      'const runner = new ns.Runner();\n  const out = await runner.run();',
    ],
    [
      'an argument of another call: the instance first, then the await hoisted by no-inline-await',
      'expect(await new Runner().run()).toBe(1);',
      'const runner = new Runner();\n  const result = await runner.run();\n  expect(result).toBe(1);',
    ],
  ])('%s', (_name, statement, expected) => {
    expect(fixed(inFunction(statement)).output).toBe(inFunction(expected));
  });

  test('the fixed code has no finding of the rule left', () => {
    const code = inFunction(
      'await new A().one();\n  const b = await new B().two();\n  const c = await new C().x().y();',
    );
    const { output } = fixed(code);

    expect(findings(output)).toEqual([]);
  });

  test('a name already in use gets a number, and two instances in one function get two names', () => {
    const code = inFunction(
      'const response = 1;\n  const a = await new Response(x).text();\n  const b = await new Response(y).text();\n  void response;',
    );
    const { output } = fixed(code);

    expect(output).toContain('const response2 = new Response(x);');
    expect(output).toContain('const response3 = new Response(y);');
    expect(findings(output)).toEqual([]);
  });

  test('an await that follows an effect in its statement is reported and not rewritten', () => {
    const code = inFunction('log(next(), await new Runner().run());');
    const [message] = findings(code);

    expect(message).toBeDefined();
    expect(message?.fix).toBeUndefined();
  });

  test('an await in a branch is reported and not rewritten', () => {
    const code = inFunction('const out = ready && (await new Runner().run());');
    const [message] = findings(code);

    expect(message).toBeDefined();
    expect(message?.fix).toBeUndefined();
  });

  test('the result still compiles as TypeScript with the type argument and the annotation kept', () => {
    const code = inFunction('const out: Result = await new Runner<Options>(a).run<Result>(b);');
    const { output, fixed: wasFixed } = fixed(code);

    expect(wasFixed).toBe(true);
    expect(output).toContain('const runner = new Runner<Options>(a);');
    expect(output).toContain('const out: Result = await runner.run<Result>(b);');
  });
});

describe('venizia/no-await-new-chain: where it is configured', () => {
  test('the house preset sets it to error', () => {
    const messages = new Linter().verify(inFunction('await new Runner().run();'), CONFIGS, {
      filename: 'src/subject.ts',
    });

    expect(messages.find((message) => message.ruleId === RULE)?.severity).toBe(2);
  });
});

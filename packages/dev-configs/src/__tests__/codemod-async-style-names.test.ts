import { beforeAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import { AsyncStyle } from '../cli/codemod/async-style';

const linter = new Linter();
let config: Linter.Config[] = [];
let checks: Linter.Config[] = [];

beforeAll(async () => {
  const created = await AsyncStyle.createConfig();
  const createdChecks = await AsyncStyle.createChecks();

  config = created;
  checks = createdChecks;
});

const fix = (source: string) =>
  AsyncStyle.fix({ linter, config, checks, source, filename: 'a.ts' });

/** Runs the exported `main` of a TypeScript module text with the stubs it needs and returns what it logged. */
const run = async (opts: { source: string; stubs: Record<string, unknown> }): Promise<string[]> => {
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(opts.source);
  const log: string[] = [];
  const names = Object.keys(opts.stubs);
  const body = `${js.replaceAll('export ', '')}\nreturn main;`;
  const main = new Function(...names, 'log', body)(...Object.values(opts.stubs), (line: string) =>
    log.push(line),
  );
  await main();

  return log;
};

const BANA = `class Svc {
  async main(): Promise<string> {
    try {
      if (!(await lock({ id: 1 }))) {
        return 'BUSY';
      }

      log('after-lock');
      return await compact({ id: 1 });
    } finally {
      log('unlock');
    }
  }
}
const main = () => new Svc().main().then(log);
`;

const declared = (text: string): string[] =>
  [...text.matchAll(/\bconst (\w+) = await/g)].map((match) => match[1] ?? '');

describe('async-style: the names the fixers hoist', () => {
  test('two rules in one pass hand out two different names, never the same one', () => {
    const result = fix(BANA);
    const names = declared(result.output);

    expect(result.reports).toEqual([]);
    expect(names.length).toBe(2);
    expect(new Set(names).size).toBe(2);
  });

  test('each replaced expression uses exactly the name of its own hoisted const', () => {
    const result = fix(BANA);
    const [first, second] = declared(result.output);

    expect(result.output).toContain(`const ${first} = await lock({ id: 1 });`);
    expect(result.output).toContain(`if (!${first}) {`);
    expect(result.output).toContain(`const ${second} = await compact({ id: 1 });`);
    expect(result.output).toContain(`return ${second};`);
  });

  test('the fixed program does what the original did', async () => {
    const result = fix(BANA);

    for (const locked of [true, false]) {
      const stubs = {
        lock: async () => locked,
        compact: async () => 'COMPACTED',
      };
      const was = await run({ source: BANA, stubs });
      const now = await run({ source: result.output, stubs });

      expect(now).toEqual(was);
    }
  });

  test('names that are already in scope are skipped, in the same function and in a nested one', () => {
    const source = `class Svc {
  async main(): Promise<string> {
    const result = 1;
    const result2 = 2;
    try {
      const inner = async () => {
        const result3 = 3;
        return result3 + (await other());
      };
      if (!(await lock())) {
        return String(result + result2);
      }
      return await compact(inner);
    } finally {
      log('x');
    }
  }
}
`;
    const output = fix(source).output;
    const names = declared(output);

    expect(names.length).toBe(3);
    expect(new Set(names).size).toBe(3);
    for (const name of names) {
      expect(['result', 'result2', 'result3']).not.toContain(name);
    }
  });

  test('a hoist in a nested function and one in the function around it never share a name', () => {
    const source = `async function outer() {
  const f = async () => {
    return g(await a());
  };
  try {
    return await b(f);
  } finally {
    log('x');
  }
}
`;
    const names = declared(fix(source).output);

    expect(names.length).toBe(2);
    expect(new Set(names).size).toBe(2);
  });
});

describe('async-style: the self-check', () => {
  const check = (source: string, output: string) =>
    AsyncStyle.selfCheck({ linter, checks, source, output, filename: 'a.ts' });

  test('says nothing about a correct rewrite', () => {
    expect(
      check(
        'async function f() { return g(await a()); }',
        'async function f() { const result = await a(); return g(result); }',
      ),
    ).toEqual([]);
  });

  test('catches a name declared twice in one scope', () => {
    const output = `async function f() { const result = await a(); const result = await b(); return [result, result]; }`;

    expect(check('async function f() { return [await a(), await b()]; }', output).join()).toContain(
      'no-redeclare',
    );
  });

  test('catches an inner name that shadows an outer hoist', () => {
    const output = `async function f() { const result = await a(); if (result) { const result = await b(); return result; } return result; }`;

    expect(
      check('async function f() { if (await a()) { return await b(); } return 1; }', output).join(),
    ).toContain('no-shadow');
  });

  test('catches a hoisted name used before its declaration', () => {
    const output = `async function f() { if (!compact) { return 1; } const compact = await b(); return compact; }`;

    expect(check('async function f() { return 1; }', output).join()).toContain(
      'no-use-before-define',
    );
  });

  test('catches a hoisted name that nothing uses', () => {
    const output = `async function f() { const lock = await a(); return 1; }`;

    expect(check('async function f() { return 1; }', output).join()).toContain('no-unused-vars');
  });

  test('does not count what the source already had', () => {
    const source = `async function f() { const unused = 1; return 2; }`;

    expect(check(source, source)).toEqual([]);
  });

  const SOURCE = 'async function f() { return g(await a()); }';

  test('fix() leaves a clean rewrite alone and reports nothing', () => {
    const result = AsyncStyle.fix({ linter, config, checks, source: SOURCE, filename: 'a.ts' });

    expect(result.changed).toBe(true);
    expect(result.reports).toEqual([]);
  });

  test('fix() returns the file as it was, with a self-check report, when the fixed text is worse', () => {
    // A check that the rewrite is bound to break: it forbids any declaration named result*, which every fix adds.
    const strict: Linter.Config[] = [
      ...checks,
      {
        files: ['**/*.ts'],
        rules: {
          'no-restricted-syntax': ['error', 'VariableDeclarator[id.name=/^result/]'],
        },
      },
    ];
    const result = AsyncStyle.fix({
      linter,
      config,
      checks: strict,
      source: SOURCE,
      filename: 'a.ts',
    });

    expect(result.changed).toBe(false);
    expect(result.output).toBe(SOURCE);
    expect(result.fixes).toBe(0);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]?.ruleId).toBe('self-check');
    expect(result.reports[0]?.message).toContain('no-restricted-syntax');
  });
});

import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import ts from 'typescript';
import {
  NoAwaitPromiseChainRule,
  NoSilentCatchRule,
  asyncStyleConfigs,
  houseConfigs,
  houseEslintPlugin,
  reactAsyncStyleConfigs,
  reactHouseConfigs,
} from '../linters/house';

const CONFIGS = [...houseConfigs, ...asyncStyleConfigs];
const CHAIN = NoAwaitPromiseChainRule.NAME;
const SILENT = NoSilentCatchRule.NAME;

/** The findings of `ruleId` on `code`, as if it lived in `filename`. */
const findings = (opts: {
  code: string;
  ruleId: string;
  configs?: Linter.Config[];
  filename?: string;
}) => {
  const { code, ruleId, configs = CONFIGS, filename = 'src/subject.ts' } = opts;
  return new Linter()
    .verify(code, configs, { filename })
    .filter((message) => message.ruleId === ruleId);
};

/** Only `no-await-promise-chain`, at error: what its own fixer does, with no other rule fixing after it. */
const CHAIN_ONLY: Linter.Config[] = [
  ...houseConfigs,
  { files: ['**/*.ts'], plugins: { venizia: houseEslintPlugin }, rules: { [CHAIN]: 'error' } },
];

const fixChainOnly = (code: string) =>
  new Linter().verifyAndFix(code, CHAIN_ONLY, { filename: 'src/subject.ts' }).output;

const wrap = (body: string) => `async function run() {\n  ${body}\n}`;

/**
 * Type errors of `code` under strict TypeScript (`noImplicitAny`, `useUnknownInCatchVariables`), compiled in
 * memory with the compiler API. `f` returns `Promise<string>` and `g` a `Promise<number>`.
 */
const typeErrors = (code: string): string[] => {
  const fileName = 'subject.ts';
  const source = `declare function f(): Promise<string>;\ndeclare function g(): Promise<number>;\ndeclare const fallback: string;\nexport {};\n${code}\n`;
  const options: ts.CompilerOptions = {
    strict: true,
    noImplicitAny: true,
    useUnknownInCatchVariables: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    lib: ['lib.es2022.d.ts'],
    types: [],
    noEmit: true,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options, true);
  const readSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
    name === fileName
      ? ts.createSourceFile(name, source, languageVersion, true)
      : readSource(name, languageVersion, onError, shouldCreate);

  const program = ts.createProgram({ rootNames: [fileName], options, host });

  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (diagnostic) =>
        `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
    );
};

describe('venizia/no-await-promise-chain: what is reported', () => {
  test('each awaited chain shape is reported once', () => {
    const shapes = [
      'await f().catch(h);',
      'await f().then(g);',
      'await f().finally(h);',
      'const value = await f().catch(h);',
      'await Promise.all(xs).then(g);',
      'await f()?.then(g);',
      "await f()['then'](g);",
      'await f()[`catch`](h);',
      'await (f().then(g));',
      'await f().then(g)!;',
      'await (f().then(g) as Promise<number>);',
      'await (f().then(g) satisfies Promise<number>);',
      'await query.where(a).then(g);',
      'const y = await (await f()).then(g);',
      'x = await f().catch(h);',
      'use(await f().then(g));',
      'return await f().then(g);',
    ];

    for (const shape of shapes) {
      const code = wrap(`let x; const xs = []; const query = q; ${shape}`);
      expect(findings({ code, ruleId: CHAIN }).length, shape).toBe(1);
    }
  });

  test('a longer chain is one report, on the await', () => {
    const code = wrap('await f().then(a).catch(b).finally(c);');
    const result = findings({ code, ruleId: CHAIN });

    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('`.finally(...)`');
    expect(result[0]?.column).toBe(3);
  });

  test('the message names both ways out', () => {
    const [message] = findings({ code: wrap('await f().then(g);'), ruleId: CHAIN });

    expect(message?.message).toContain('wrap `await f()` in try/catch');
    expect(message?.message).toContain('drop the `await` and keep the chain');
  });
});

describe('venizia/no-await-promise-chain: what is allowed', () => {
  test('a chain that is not awaited, and an await of no chain, are silent', () => {
    const shapes = [
      'return f().then(g);',
      'f().then(g).catch(h);',
      'void f().then(g).catch(h);',
      'const pending = f().then(g);',
      'await Promise.all(xs.map((item) => g(item)));',
      'await Promise.race([f(), g()]);',
      'await Promise.allSettled([f()]);',
      'await Promise.any([f()]);',
      'await new Promise((resolve) => setTimeout(resolve, 1));',
      'await x.then;',
      'await promise;',
      'await f();',
      'await f(g().then(h));',
      'await this.repository.find({ where: { id } });',
    ];

    for (const shape of shapes) {
      const code = wrap(
        `const xs = []; const x = { then: 1 }; const promise = f(); const id = 1; ${shape}`,
      );
      expect(findings({ code, ruleId: CHAIN }), shape).toEqual([]);
    }
  });

  test('an await inside a callback of a pure chain is not reported (owner answer a)', () => {
    const code = wrap(
      'f().then(async () => { await g(); }).catch(async (error) => { await report(error); });',
    );

    expect(findings({ code, ruleId: CHAIN })).toEqual([]);
  });

  test('the positive control: an awaited chain inside such a callback is still reported', () => {
    const code = wrap('f().then(async () => { await g().catch(h); });');

    expect(findings({ code, ruleId: CHAIN })).toHaveLength(1);
  });

  test('applies to test files too', () => {
    const code = "test('x', async () => { await f().then(g); });";

    expect(findings({ code, ruleId: CHAIN, filename: 'src/x.test.ts' })).toHaveLength(1);
  });

  test('is silent without the opt-in configs, and is in both opt-in arrays', () => {
    const code = wrap('await f().then(g);');

    expect(findings({ code, ruleId: CHAIN, configs: houseConfigs })).toEqual([]);
    expect(findings({ code, ruleId: CHAIN, configs: reactHouseConfigs })).toEqual([]);
    expect(
      findings({ code, ruleId: CHAIN, configs: [...houseConfigs, ...asyncStyleConfigs] }),
    ).toHaveLength(1);
    expect(
      findings({ code, ruleId: CHAIN, configs: [...reactHouseConfigs, ...reactAsyncStyleConfigs] }),
    ).toHaveLength(1);
  });
});

describe('venizia/no-await-promise-chain: the fix', () => {
  test('a const without annotation becomes a let assigned in try and in catch', () => {
    const out = fixChainOnly(wrap('const value = await f().catch(() => null);\n  return value;'));

    expect(out).toBe(
      wrap(
        [
          'let value;',
          '  try {',
          '    value = await f();',
          '  } catch (error) {',
          '    value = null;',
          '  }',
          '  return value;',
        ].join('\n'),
      ),
    );
  });

  test('the message says the const becomes a let only when the fix is made', () => {
    const [fixable] = findings({
      code: wrap('const v = await f().catch(() => null);'),
      ruleId: CHAIN,
    });
    const [notFixable] = findings({ code: wrap('await f().catch(() => null);'), ruleId: CHAIN });

    expect(fixable?.message).toContain('turns the `const` into a `let`');
    expect(fixable?.fix).toBeDefined();
    expect(notFixable?.message).not.toContain('`let`');
    expect(notFixable?.fix).toBeUndefined();
  });

  test('a type annotation is kept, and let stays let', () => {
    expect(
      fixChainOnly(wrap('const value: string | null = await f().catch(() => null);')),
    ).toContain(
      'let value: string | null;\n  try {\n    value = await f();\n  } catch (error) {\n    value = null;\n  }',
    );
    expect(fixChainOnly(wrap('let value = await f().catch(() => 0);'))).toContain(
      'let value;\n  try {\n    value = await f();\n  } catch (error) {\n    value = 0;\n  }',
    );
  });

  test("the catch variable takes the handler's parameter name, typed any when the value reads it", () => {
    expect(
      fixChainOnly(wrap('const message = await f().catch((reason) => reason.message);')),
    ).toContain('} catch (reason: any) {\n    message = reason.message;\n  }');
    expect(fixChainOnly(wrap('const value = await f().catch((ignored) => 0);'))).toContain(
      '} catch (ignored) {\n    value = 0;\n  }',
    );
  });

  test('a catch name that would shadow or collide is renamed, with the reads that use it', () => {
    // `error` is declared around: the catch variable becomes `error2`.
    expect(
      fixChainOnly(wrap('const error = 1;\n  const value = await f().catch(() => error);')),
    ).toContain('} catch (error2) {\n    value = error;\n  }');
    // The parameter has the declared name: it is renamed, a shorthand property keeps its key.
    expect(
      fixChainOnly(
        wrap('const value = await f().catch((value) => ({ value, code: value.code }));'),
      ),
    ).toContain('} catch (value2: any) {\n    value = { value: value2, code: value2.code };\n  }');
  });

  test('the value forms that are moved: literals, identifiers, error reads, arrays and objects of those', () => {
    for (const value of [
      "'none'",
      '-1',
      'undefined',
      'fallback',
      '[1, "a"]',
      '({})',
      '({ items: [], total: 0 })',
      '({ reason, status: reason.status })',
      'reason?.response.status',
      "reason['code']",
    ]) {
      const code = wrap(`const value = await f().catch((reason) => ${value});`);
      expect(fixChainOnly(code), value).not.toBe(code);
    }
  });

  test('an empty array is moved only under a type annotation: a bare `let` would make it an evolving any[]', () => {
    const bare = wrap('const items = await f().catch(() => []);');
    const annotated = wrap('const items: string[] = await f().catch(() => []);');

    expect(fixChainOnly(bare)).toBe(bare);
    expect(fixChainOnly(annotated)).toContain('} catch (error) {\n    items = [];\n  }');
  });

  test('every unsafe shape is reported and left untouched', () => {
    const cases = [
      'const value = await f().then((v) => v);',
      'const value = await f().finally(() => done());',
      'const value = await f().catch(() => { return null; });',
      'const value = await f().catch(() => recover());',
      'const value = await f().catch((reason) => wrapError(reason));',
      'const value = await f().catch(async () => null);',
      'const value = await f().catch((reason: Error) => reason.message);',
      'const value = await f().catch((reason) => reason.message.trim());',
      'const value = await f().catch(handler);',
      'const value = await f().catch(() => null, extra);',
      'const value = await f().then(g).catch(() => null);',
      'const value = await f().finally(done).catch(() => null);',
      'const value = await (await g()).catch(() => null);',
      'const value = await f()?.catch(() => null);',
      "const value = await f()['catch'](() => null);",
      'const value = await (f().catch(() => null) as Promise<string | null>);',
      'const value = await f().catch(() => value);',
      'const { value } = await f().catch(() => ({ value: 1 }));',
      'const a = 1, value = await f().catch(() => null);',
      'var value = await f().catch(() => null);',
      'await f().catch(() => null);',
      'return await f().catch(() => null);',
      'use(await f().catch(() => null));',
      'const value = await f().catch(() => null); value = 2;',
      'let value = await f().catch(() => null); value = 2;',
      'const value = await f().catch(() => null); const read = () => value;',
      'const value = await f() /* keep */ .catch(() => null);',
      'if (ready) { for (const value = await f().catch(() => null); ; ) { break; } }',
    ];

    for (const body of cases) {
      const code = wrap(`const ready = true; ${body}`);

      expect(fixChainOnly(code), body).toBe(code);
      expect(findings({ code, ruleId: CHAIN }).length, body).toBeGreaterThan(0);
    }
  });

  test('a top-level declaration of a module is fixed; an exported one is not', () => {
    expect(fixChainOnly('const value = await f().catch(() => null);\nexport { value };')).toBe(
      'const value = await f().catch(() => null);\nexport { value };',
    );
    expect(fixChainOnly('export const value = await f().catch(() => null);')).toBe(
      'export const value = await f().catch(() => null);',
    );
    expect(fixChainOnly('const value = await f().catch(() => null);\nuse(value);')).toContain(
      'let value;\ntry {\n  value = await f();\n} catch (error) {\n  value = null;\n}\nuse(value);',
    );
  });

  test('an annotated declaration read in a nested function is fixed: its type does not depend on flow', () => {
    const code = wrap(
      'const value: string | null = await f().catch(() => null);\n  const read = () => value;',
    );

    expect(fixChainOnly(code)).toContain('let value: string | null;');
  });
});

describe('venizia/no-await-promise-chain: the fixed code typechecks', () => {
  const shapes = [
    // annotated, read in a nested function
    'const value: string | null = await f().catch(() => null);\nconst read = () => value;\nread();',
    // not captured, no annotation, the fallback of each value form
    'const value = await f().catch(() => null);\nconst length: number | undefined = value?.length;\nvoid length;',
    'const value = await f().catch(() => fallback);\nconst text: string = value;\nvoid text;',
    'const count = await g().catch(() => -1);\nconst next: number = count + 1;\nvoid next;',
    'const items: string | string[] = await f().catch(() => []);\nvoid items;',
    "const page = await f().catch(() => ({ items: [], total: 0, label: 'none' }));\nvoid page;",
    'const message = await f().catch((reason) => reason.message);\nconst text: string = message;\nvoid text;',
    'const status = await f().catch((reason) => reason?.response.status);\nvoid status;',
    'let value = await f().catch(() => undefined);\nconst text: string | undefined = value;\nvoid text;',
  ];

  test('the source compiles before the fix (the positive control)', () => {
    for (const shape of shapes) {
      expect(typeErrors(shape), shape).toEqual([]);
    }
  });

  test('the output of the fixer alone compiles, and the fix was made', () => {
    for (const shape of shapes) {
      const out = fixChainOnly(shape);

      expect(out, shape).toContain('try {');
      expect(typeErrors(out), out).toEqual([]);
    }
  });

  test('the output of every async-style fixer together compiles too (no-inline-await hoists the assignment)', () => {
    for (const shape of shapes) {
      const out = new Linter().verifyAndFix(shape, CONFIGS, { filename: 'src/subject.ts' }).output;

      expect(out, shape).toContain('const result = await');
      expect(typeErrors(out), out).toEqual([]);
    }
  });

  test('the compiler check can fail: a let without annotation read in a nested function is an implicit any', () => {
    // An arrow created after the last assignment keeps the narrowed type (TypeScript 5.4 and later); a function
    // declaration is hoisted and does not, on every supported TypeScript version.
    const errors = typeErrors(
      'let value;\ntry { value = await f(); } catch (error) { value = null; }\nfunction read() { return value; }\nread();',
    );

    expect(errors.join('\n')).toContain('TS7034');
  });
});

describe('venizia/no-silent-catch', () => {
  test('each silent handler and catch block is reported once', () => {
    const shapes = [
      'f().catch(() => null);',
      'f().catch(() => undefined);',
      'f().catch(() => ({}));',
      'f().catch(() => []);',
      'f().catch(() => {});',
      'f().catch(function () {});',
      'f().catch((error) => null);',
      'f()?.catch(() => null);',
      "f()['catch'](() => null);",
      'f().catch(() => { return; });',
      'f().catch(() => { return false; });',
      'f().catch(async () => {});',
      'const value = await f().catch(() => null);',
      'try { run(); } catch {}',
      'try { run(); } catch (error) {}',
      'try { run(); } catch (error) { /* ignore */ }',
      'try { run(); } catch {\n  // nothing to do\n}',
      'try { run(); } catch { state = null; }',
      'try { run(); } catch { this.ready = false; }',
      'try { run(); } catch { return { items: [] }; }',
      'try { run(); } catch { return; }',
    ];

    for (const shape of shapes) {
      const code = wrap(`let state; ${shape}`);
      expect(findings({ code, ruleId: SILENT }).length, shape).toBe(1);
    }
  });

  test('a handler or block that logs, rethrows, wraps, reads the error or calls anything is not reported', () => {
    const shapes = [
      'f().catch((error) => logger.error(error));',
      'f().catch((error) => { throw error; });',
      'f().catch((error) => { throw getError({ message: String(error) }); });',
      'f().catch((error) => error);',
      'f().catch(() => recover());',
      'f().catch(() => { cleanup(); });',
      'f().catch(() => fallback);',
      'f().catch(report);',
      'f().then(() => null, () => null);',
      'try { run(); } catch (error) { logger.error(error); }',
      'try { run(); } catch (error) { throw error; }',
      'try { run(); } catch (error) { state = error; }',
      // The only constant-only body that still references the error: the error variable is the target.
      'try { run(); } catch (error) { error = null; }',
      'f().catch((error) => { error = undefined; });',
      'try { run(); } catch { cleanup(); }',
      'try { run(); } catch { throw getError({ message: "x" }); }',
      'try { run(); } catch ({ message }) { state = null; }',
      'try { run(); } catch { state = other; }',
      'try { run(); } finally { state = null; }',
    ];

    for (const shape of shapes) {
      const code = wrap(`let state; const other = 1; const fallback = 0; ${shape}`);
      expect(findings({ code, ruleId: SILENT }), shape).toEqual([]);
    }
  });

  test('a disable comment with a reason is the way to keep one', () => {
    const code = wrap(
      'f()\n    // eslint-disable-next-line venizia/no-silent-catch -- a missing cache entry is expected\n    .catch(() => null);',
    );

    expect(findings({ code, ruleId: SILENT })).toEqual([]);
  });

  test('ESLint no-empty and this rule both report catch {}, and only this rule a comment-only catch', () => {
    const empty = 'try { run(); } catch {}';
    const commented = 'try { run(); } catch { /* ignore */ }';
    const withNoEmpty: Linter.Config[] = [...CONFIGS, { rules: { 'no-empty': 'error' } }];

    expect(findings({ code: empty, ruleId: 'no-empty', configs: withNoEmpty })).toHaveLength(1);
    expect(findings({ code: empty, ruleId: SILENT, configs: withNoEmpty })).toHaveLength(1);
    expect(findings({ code: commented, ruleId: 'no-empty', configs: withNoEmpty })).toEqual([]);
    expect(findings({ code: commented, ruleId: SILENT, configs: withNoEmpty })).toHaveLength(1);
  });

  test('the fix of no-await-promise-chain leaves a catch this rule reports, on purpose', () => {
    const out = new Linter().verifyAndFix(
      wrap('const value = await f().catch(() => null);'),
      CONFIGS,
      {
        filename: 'src/subject.ts',
      },
    );

    expect(out.output).toContain('} catch (error) {');
    expect(out.messages.map((message) => message.ruleId)).toEqual([SILENT]);
  });

  test('is silent without the opt-in configs, and is in both opt-in arrays', () => {
    const code = 'f().catch(() => null);';

    expect(findings({ code, ruleId: SILENT, configs: houseConfigs })).toEqual([]);
    expect(findings({ code, ruleId: SILENT, configs: reactHouseConfigs })).toEqual([]);
    expect(
      findings({
        code,
        ruleId: SILENT,
        configs: [...reactHouseConfigs, ...reactAsyncStyleConfigs],
      }),
    ).toHaveLength(1);
    expect(findings({ code, ruleId: SILENT })).toHaveLength(1);
  });
});

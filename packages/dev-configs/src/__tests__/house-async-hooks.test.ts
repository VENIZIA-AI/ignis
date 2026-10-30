import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import {
  EffectCleanupConsistencyRule,
  NoAsyncHookCallbackRule,
  reactAsyncStyleConfigs,
  reactHouseConfigs,
} from '../linters/house';

const CONFIGS = [...reactHouseConfigs, ...reactAsyncStyleConfigs];

/** Runs the React house configs with the async hook rules on `code`, and returns the findings of `ruleId`. */
const findings = (opts: { code: string; ruleId: string; filename?: string }) => {
  const { code, ruleId, filename = 'src/subject.ts' } = opts;
  return new Linter()
    .verify(code, CONFIGS, { filename })
    .filter((message) => message.ruleId === ruleId);
};

describe('venizia/no-async-hook-callback', () => {
  const flagged = (code: string) => findings({ code, ruleId: NoAsyncHookCallbackRule.NAME });

  test('reports an async arrow passed to a hook', () => {
    const result = flagged(`useEffect(async () => {}, []);`);

    expect(result.length).toBe(1);
    expect(result[0]?.message).toContain('`useEffect`');
  });

  test('reports an async function expression passed to a hook', () => {
    expect(flagged(`useCallback(async function () {}, []);`).length).toBe(1);
  });

  test('reports a member hook such as React.useMemo', () => {
    expect(flagged(`React.useMemo(async () => 1, []);`).length).toBe(1);
  });

  test('reports an async function in any argument position of a custom hook', () => {
    expect(flagged(`useFoo(a, async () => {});`).length).toBe(1);
  });

  test('does not report a sync callback', () => {
    expect(flagged(`useEffect(() => {}, []);`).length).toBe(0);
  });

  test('does not report a call that is not a hook', () => {
    expect(
      flagged(`run(async () => {}); user(async () => {}); React.run(async () => {});`).length,
    ).toBe(0);
  });

  test('does not report an async function nested in an object argument', () => {
    expect(flagged(`useFoo({ fn: async () => {} });`).length).toBe(0);
  });

  test('is checked in a .tsx file too', () => {
    const result = findings({
      code: `export const A = () => { useEffect(async () => {}, []); return <div />; };`,
      ruleId: NoAsyncHookCallbackRule.NAME,
      filename: 'src/a.tsx',
    });

    expect(result.length).toBe(1);
  });

  test('is silent without reactAsyncStyleConfigs', () => {
    const messages = new Linter().verify(`useEffect(async () => {}, []);`, reactHouseConfigs, {
      filename: 'src/subject.ts',
    });

    expect(messages.filter((m) => m.ruleId === NoAsyncHookCallbackRule.NAME).length).toBe(0);
  });
});

describe('venizia/effect-cleanup-consistency', () => {
  const flagged = (code: string) => findings({ code, ruleId: EffectCleanupConsistencyRule.NAME });

  test('passes a callback that returns nothing', () => {
    expect(flagged(`useEffect(() => { run(); }, []);`).length).toBe(0);
  });

  test('passes a callback with only a bare return', () => {
    expect(flagged(`useEffect(() => { if (a) { return; } run(); return; }, []);`).length).toBe(0);
  });

  test('passes a cleanup returned on every path', () => {
    const code = `useEffect(() => {
      if (a) { return () => {}; }
      run();
      return () => stop();
    }, []);`;

    expect(flagged(code).length).toBe(0);
  });

  test('passes an expression-bodied arrow', () => {
    expect(flagged(`useEffect(() => unsubscribe(), []);`).length).toBe(0);
  });

  test('passes when every path returns and the end is unreachable', () => {
    const code = `useEffect(() => { if (a) { return () => {}; } else { return () => {}; } }, []);`;

    expect(flagged(code).length).toBe(0);
  });

  test('reports an early bare return beside a later cleanup', () => {
    const code = `useEffect(() => {
      if (!a) { return; }
      return () => {};
    }, []);`;
    const result = flagged(code);

    expect(result.length).toBe(1);
    expect(result[0]?.message).toContain('`useEffect`');
  });

  test('reports a cleanup returned on one branch while the end falls off', () => {
    expect(flagged(`useEffect(() => { if (a) { return () => {}; } run(); }, []);`).length).toBe(1);
  });

  test('counts a returned identifier as a value', () => {
    const code = `useEffect(() => {
      const unsubscribe = subscribe();
      if (!a) { return; }
      return unsubscribe;
    }, []);`;

    expect(flagged(code).length).toBe(1);
  });

  test('does not count the return of a nested function', () => {
    const code = `useEffect(() => {
      run(() => { return () => {}; });
      return;
    }, []);`;

    expect(flagged(code).length).toBe(0);
  });

  test('checks a function expression callback and its own returns', () => {
    const code = `useEffect(function () { if (a) { return; } return () => {}; }, []);`;

    expect(flagged(code).length).toBe(1);
  });

  test('checks React.useEffect, useLayoutEffect and useInsertionEffect', () => {
    const body = `() => { if (a) { return; } return () => {}; }`;

    expect(flagged(`React.useEffect(${body}, []);`).length).toBe(1);
    expect(flagged(`useLayoutEffect(${body}, []);`).length).toBe(1);
    expect(flagged(`useInsertionEffect(${body}, []);`).length).toBe(1);
  });

  test('checks an effect in a .ts file', () => {
    const result = findings({
      code: `export const useThing = () => { useEffect(() => { if (a) { return; } return () => {}; }, []); };`,
      ruleId: EffectCleanupConsistencyRule.NAME,
      filename: 'src/use-thing.ts',
    });

    expect(result.length).toBe(1);
  });

  test('ignores callbacks of other hooks', () => {
    expect(flagged(`useMemo(() => { if (a) { return; } return 1; }, []);`).length).toBe(0);
  });

  test('is silent without reactAsyncStyleConfigs', () => {
    const messages = new Linter().verify(
      `useEffect(() => { if (a) { return; } return () => {}; }, []);`,
      reactHouseConfigs,
      { filename: 'src/subject.ts' },
    );

    expect(messages.filter((m) => m.ruleId === EffectCleanupConsistencyRule.NAME).length).toBe(0);
  });
});

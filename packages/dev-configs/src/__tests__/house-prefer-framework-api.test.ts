import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  BrowserApiPatterns,
  houseConfigs,
  houseEslintPlugin,
  PreferFrameworkApiRule,
  reactHouseConfigs,
} from '../linters/house';

const NAME = PreferFrameworkApiRule.NAME;

/** `code` as the body of a hook, which is where the rule looks. */
const inHook = (code: string) => `export const useSubject = async () => {\n${code}\n};\n`;

const lint = (opts: { code: string; options?: Linter.RuleEntry; filename?: string }) => {
  const config: Linter.Config[] = [
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: { parser: tseslint.parser as Linter.Parser },
      plugins: { venizia: houseEslintPlugin },
      rules: { [NAME]: opts.options ?? ['error'] },
    },
  ];

  return new Linter().verify(opts.code, config, { filename: opts.filename ?? 'src/subject.ts' });
};

describe('venizia/prefer-framework-api', () => {
  test.each([
    ['window.matchMedia', `const q = window.matchMedia('(min-width: 600px)');`, 'useMediaQuery'],
    ['a bare matchMedia', `const q = matchMedia('(min-width: 600px)');`, 'useBreakpoint'],
    ['globalThis.matchMedia', `const q = globalThis.matchMedia('print');`, 'useMediaQuery'],
    ['window.innerWidth', `const w = window.innerWidth;`, 'useWindowDimensions'],
    ['window.innerHeight', `const h = window.innerHeight;`, 'useWindowDimensions'],
    [
      'a window resize listener',
      `window.addEventListener('resize', onResize);`,
      'useWindowDimensions',
    ],
    ['new ResizeObserver', `const o = new ResizeObserver(() => {});`, 'useElementSize'],
    [
      'new window.ResizeObserver',
      `const o = new window.ResizeObserver(() => {});`,
      'useResizeEffect',
    ],
    [
      'new IntersectionObserver',
      `const o = new IntersectionObserver(() => {});`,
      'useIntersection',
    ],
    ['navigator.onLine', `const online = navigator.onLine;`, 'useOnlineStatus'],
    ['window.navigator.onLine', `const online = window.navigator.onLine;`, 'useOnlineStatus'],
    ['an online listener', `window.addEventListener('online', up);`, 'useOnlineStatus'],
    ['an offline listener', `window.addEventListener('offline', down);`, 'useOnlineStatus'],
    ['document.visibilityState', `const s = document.visibilityState;`, 'useDocumentVisibility'],
    [
      'a visibilitychange listener',
      `document.addEventListener('visibilitychange', f);`,
      'useDocumentVisibility',
    ],
    ['a beforeunload listener', `window.addEventListener('beforeunload', f);`, 'useBeforeUnload'],
    [
      'navigator.clipboard.writeText',
      `await navigator.clipboard.writeText(text);`,
      'useCopyToClipboard',
    ],
    ['window.confirm', `if (window.confirm('Sure?')) go();`, 'useConfirm'],
    ['a bare confirm', `if (confirm('Sure?')) go();`, 'useConfirm'],
  ])('%s, in a hook, names its hook', (_name, code, hook) => {
    const findings = lint({ code: inHook(code) });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain(hook);
    // A row that suggests two hooks imports the first one only: the second would be an unused import.
    const first = /`(use\w+)`/.exec(findings[0]?.message ?? '')?.[1];

    expect(findings[0]?.message).toContain(`import { ${first} } from '@venizia/ardor-react';`);
  });

  test('a name the file binds itself, an element listener and an unlisted event are not reported', () => {
    expect(
      lint({ code: inHook(`const matchMedia = (q: string) => q;\nmatchMedia('x');`) }),
    ).toHaveLength(0);
    expect(
      lint({
        code: `export const useSubject = (window: { innerWidth: number }) => window.innerWidth;`,
      }),
    ).toHaveLength(0);
    expect(
      lint({
        code: `import { confirm } from './dialogs';\nexport const useSubject = () => confirm('x');\n`,
      }),
    ).toHaveLength(0);
    // The same call with the global in scope is reported, so the two cases above are the binding, not a parse failure.
    expect(lint({ code: `export const useSubject = () => confirm('x');` })).toHaveLength(1);
    expect(lint({ code: inHook(`button.addEventListener('resize', f);`) })).toHaveLength(0);
    expect(lint({ code: inHook(`window.addEventListener('scroll', f);`) })).toHaveLength(0);
    expect(lint({ code: inHook(`const w = window.outerWidth;`) })).toHaveLength(0);
    expect(lint({ code: inHook(`const n = navigator.language;`) })).toHaveLength(0);
    expect(lint({ code: inHook(`const o = new MutationObserver(() => {});`) })).toHaveLength(0);
  });

  test('ignore switches a pattern off by id', () => {
    const code = inHook(`window.confirm('x');\nnew ResizeObserver(() => {});`);

    expect(lint({ code })).toHaveLength(2);
    expect(lint({ code, options: ['error', { ignore: ['confirm'] }] })).toHaveLength(1);
  });

  test('a module function, a class and a module-level guard are not in React and are left alone', () => {
    expect(lint({ code: `export const isMobile = () => window.innerWidth < 768;` })).toHaveLength(
      0,
    );
    expect(
      lint({
        code: `export class Tracker { start() { document.addEventListener('visibilitychange', this.onChange); } }`,
      }),
    ).toHaveLength(0);
    expect(
      lint({
        code: `export const query = typeof window !== 'undefined' && window.matchMedia('print');`,
      }),
    ).toHaveLength(0);
    expect(
      lint({
        code: `export function measure(el: Element) { return new ResizeObserver(() => {}); }`,
      }),
    ).toHaveLength(0);
  });

  test('a component and a hook are reported, whatever their shape', () => {
    const component = `export function Panel() {\n  const q = window.matchMedia('print');\n  return <div>{String(q)}</div>;\n}\n`;
    const arrow = `export const Panel = () => {\n  const q = window.matchMedia('print');\n  return <div>{String(q)}</div>;\n};\n`;
    const wrapped = `export const Panel = memo(() => {\n  const q = window.matchMedia('print');\n  return <div>{String(q)}</div>;\n});\n`;
    const guarded = `export function Panel() {\n  const q = typeof window !== 'undefined' && window.matchMedia('print');\n  return <div>{String(q)}</div>;\n}\n`;
    const named = `export function useQuery() {\n  return window.matchMedia('print');\n}\n`;

    for (const code of [component, arrow, wrapped, guarded, named]) {
      expect(lint({ code, filename: 'src/subject.tsx' })).toHaveLength(1);
    }
  });

  test('a PascalCase function that draws no JSX is not a component', () => {
    expect(
      lint({ code: `export function Format() { return window.matchMedia('print'); }` }),
    ).toHaveLength(0);
  });

  test('a callback handed to a hook is still the hook; a handler inside it is not', () => {
    const effect = `export const useSubject = () => {\n  useEffect(() => {\n    const q = window.matchMedia('print');\n    return () => q.removeEventListener('change', f);\n  }, []);\n};\n`;
    const handler = `export function Panel() {\n  const onClick = () => {\n    const w = window.innerWidth;\n    if (window.confirm('Sure?')) go(w);\n  };\n  return <button onClick={onClick} />;\n}\n`;
    const inlineHandler = `export function Panel() {\n  return <button onClick={() => window.innerWidth} />;\n}\n`;

    expect(lint({ code: effect, filename: 'src/subject.tsx' })).toHaveLength(1);
    expect(lint({ code: handler, filename: 'src/subject.tsx' })).toHaveLength(0);
    expect(lint({ code: inlineHandler, filename: 'src/subject.tsx' })).toHaveLength(0);
  });

  test('a subscription inside a handler of a component is still reported: it belongs in a hook', () => {
    const code = `export function Panel() {\n  const onClick = () => {\n    window.addEventListener('beforeunload', f);\n    new ResizeObserver(() => {});\n  };\n  return <button onClick={onClick} />;\n}\n`;

    expect(lint({ code, filename: 'src/subject.tsx' })).toHaveLength(2);
  });

  test("a listener on a socket or an element of the author is not the browser's", () => {
    expect(lint({ code: inHook(`socket.addEventListener('offline', f);`) })).toHaveLength(0);
    expect(lint({ code: inHook(`this.target.addEventListener('online', f);`) })).toHaveLength(0);
    expect(lint({ code: inHook(`self.addEventListener('resize', f);`) })).toHaveLength(1);
    expect(lint({ code: inHook(`globalThis.addEventListener('online', f);`) })).toHaveLength(1);
  });

  test('every row has a unique id, a hook and a written form', () => {
    const ids = BrowserApiPatterns.TABLE.map((pattern) => pattern.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const pattern of BrowserApiPatterns.TABLE) {
      expect(pattern.hooks).toContain('use');
      expect(pattern.written.length).toBeGreaterThan(0);
    }
  });

  test('reactHouseConfigs turns it on for .ts and .tsx source and off for tests; houseConfigs does not carry it', () => {
    const code = inHook(`const q = window.matchMedia('print');`);
    const at = (filename: string, configs: Linter.Config[]) =>
      new Linter().verify(code, configs, { filename }).filter((message) => message.ruleId === NAME)
        .length;

    expect(at('src/use-query.ts', reactHouseConfigs)).toBe(1);
    expect(at('src/view.tsx', reactHouseConfigs)).toBe(1);
    expect(at('src/__tests__/use-query.test.ts', reactHouseConfigs)).toBe(0);
    expect(at('src/use-query.ts', houseConfigs)).toBe(0);
  });
});

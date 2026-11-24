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
  ])('%s names its hook', (_name, code, hook) => {
    const findings = lint({ code });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain(hook);
    expect(findings[0]?.message).toContain('@venizia/ardor-react');
  });

  test('a name the file binds itself, an element listener and an unlisted event are not reported', () => {
    expect(lint({ code: `const matchMedia = (q: string) => q;\nmatchMedia('x');` })).toHaveLength(
      0,
    );
    expect(
      lint({ code: `export const f = (window: { innerWidth: number }) => window.innerWidth;` }),
    ).toHaveLength(0);
    expect(lint({ code: `import { confirm } from './dialogs';\nconfirm('x');` })).toHaveLength(0);
    expect(lint({ code: `button.addEventListener('resize', f);` })).toHaveLength(0);
    expect(lint({ code: `window.addEventListener('scroll', f);` })).toHaveLength(0);
    expect(lint({ code: `const w = window.outerWidth;` })).toHaveLength(0);
    expect(lint({ code: `const n = navigator.language;` })).toHaveLength(0);
    expect(lint({ code: `const o = new MutationObserver(() => {});` })).toHaveLength(0);
  });

  test('ignore switches a pattern off by id', () => {
    const code = `window.confirm('x');\nnew ResizeObserver(() => {});`;

    expect(lint({ code })).toHaveLength(2);
    expect(lint({ code, options: ['error', { ignore: ['confirm'] }] })).toHaveLength(1);
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
    const code = `const q = window.matchMedia('print');`;
    const at = (filename: string, configs: Linter.Config[]) =>
      new Linter().verify(code, configs, { filename }).filter((message) => message.ruleId === NAME)
        .length;

    expect(at('src/use-query.ts', reactHouseConfigs)).toBe(1);
    expect(at('src/view.tsx', reactHouseConfigs)).toBe(1);
    expect(at('src/__tests__/use-query.test.ts', reactHouseConfigs)).toBe(0);
    expect(at('src/use-query.ts', houseConfigs)).toBe(0);
  });
});

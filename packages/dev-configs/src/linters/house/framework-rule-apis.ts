/** The framework API a rule steers code toward: what to use, where it is imported from, and one line to say it. */
export interface IFrameworkRuleApi {
  /** The name to use (`TNullable`, `PromiseUtility.sleep`, `#src/...`). */
  api: string;
  /** What to import it from: a module (`@venizia/ignis-helpers/common`) or an import-map alias (`#src`). */
  source: string;
  /** The npm package that ships it, or `null` when it is no package (an import-map alias). */
  package: string | null;
  /** The replacement, in a short sentence an agent can act on. */
  replacement: string;
}

/**
 * The framework API of each house rule that points at one, keyed by the rule's name (`venizia/prefer-tnullable`). Tools that
 * read a project's installed `@venizia/dev-configs` (VULCAN's write-time hook) use it to tell an author which API to use, so
 * a rule that steers toward the framework has an entry here; `house-framework-rules.test.ts` fails when one does not.
 */
export class FrameworkRuleApis {
  static readonly TABLE: Readonly<Record<string, IFrameworkRuleApi>> = {
    'venizia/prefer-tnullable': {
      api: 'TNullable',
      source: '@venizia/ignis-helpers/common',
      package: '@venizia/ignis-helpers',
      replacement: 'Write `TNullable<X>` for `X | null | undefined`.',
    },
    'venizia/prefer-promise-sleep': {
      api: 'PromiseUtility.sleep',
      source: '@venizia/ignis-helpers/core',
      package: '@venizia/ignis-helpers',
      replacement:
        'Write `await PromiseUtility.sleep({ ms })`, not `new Promise(resolve => setTimeout(resolve, ms))`.',
    },
    'venizia/no-shadow-framework-type': {
      api: 'the type the framework exports under that name',
      source: '@venizia/ignis-helpers/common',
      package: '@venizia/ignis-helpers',
      replacement:
        'Import `ValueOrPromise`, `TNullable`, `TConstValue` and the other framework types (from `@venizia/ignis-helpers/common`, or the entry the message names) instead of declaring your own.',
    },
    'venizia/prefer-framework-api': {
      api: 'useMediaQuery, useBreakpoint, useWindowDimensions, useElementSize, useResizeEffect, useIntersection, useOnlineStatus, useDocumentVisibility, useBeforeUnload, useCopyToClipboard, useConfirm',
      source: '@venizia/ardor-react',
      package: '@venizia/ardor-react',
      replacement:
        'Use the `@venizia/ardor-react` hook for a browser API it wraps (matchMedia, window size, ResizeObserver, IntersectionObserver, online status, document visibility, beforeunload, clipboard write, confirm), not the browser API itself.',
    },
    'venizia/no-parent-import': {
      api: '#src/...',
      source: '#src',
      package: null,
      replacement: 'Import through the package import map (`#src/...`), not through `../`.',
    },
  };

  /** The entry for `rule` (`venizia/prefer-tnullable`), or `undefined` when the rule names no framework API. */
  static of(opts: { rule: string }): IFrameworkRuleApi | undefined {
    return FrameworkRuleApis.TABLE[opts.rule];
  }
}

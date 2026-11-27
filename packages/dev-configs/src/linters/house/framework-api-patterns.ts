import type { TBrowserApiMatch } from './browser-api-patterns';

/** How a hand-written form shows up in code. */
export type TFrameworkApiMatch =
  | TBrowserApiMatch
  /**
   * A member of a global object read or called: `localStorage.getItem`; `window.` in front is the same object. With
   * `property`, the source of a regular expression, only a member whose name matches it. With `isReadOnly`, an
   * assignment to it and a `delete` of it pass.
   */
  | { type: 'member'; objects: ReadonlyArray<string>; property?: string; isReadOnly?: boolean }
  /**
   * A string or a template whose text matches `pattern`, the source of a regular expression. With `isFallbackOnly`, only
   * where it stands in for a missing value: after `??`, `||`, `??=` or `||=`, a parameter default, or a `default`, `defaultValue` or
   * `fallback` property.
   */
  | { type: 'literal'; pattern: string; isFallbackOnly?: boolean }
  /** An `import` or `import()` of one of these modules; `import type` is not one. */
  | { type: 'import'; sources: ReadonlyArray<string> }
  /** Every node an ESLint selector matches. */
  | { type: 'selector'; selector: string };

/** One hand-written form `@venizia/prefer-framework-api` reports anywhere in a file. */
export interface IFrameworkApiPattern {
  /** The name `ignore` takes to switch the row off. */
  id: string;
  match: TFrameworkApiMatch;
  /** The whole message. */
  message: string;
  /** The row applies only in a package that depends on a package whose name starts with this. */
  dependsOn?: string;
  /** The package that writes the API: the row is not reported in it. */
  owner?: string;
}

/**
 * The forms the framework replaces outside React, one row each. Unlike `BrowserApiPatterns`, a row counts anywhere in a
 * file: a service or a module function can call the API as well as a component.
 */
export class FrameworkApiPatterns {
  static readonly TABLE: ReadonlyArray<IFrameworkApiPattern> = [
    {
      id: 'application-error-instanceof',
      match: {
        type: 'selector',
        selector: "BinaryExpression[operator='instanceof'][right.name='ApplicationError']",
      },
      message:
        "Use `isApplicationError(error)`, not `instanceof ApplicationError`, which fails across two installed copies: `import { isApplicationError } from '@venizia/ignis-helpers/core';`",
      dependsOn: '@venizia/ignis',
      owner: '@venizia/ignis-inversion',
    },
    {
      id: 'process-env',
      // Only the names `applicationEnvironment` keeps: it drops a key without its prefix, such as `PORT`.
      match: { type: 'member', objects: ['process.env'], property: '^APP_ENV_', isReadOnly: true },
      message:
        "Read an `APP_ENV_` name with `applicationEnvironment.get(key)`, not `process.env`: `import { applicationEnvironment } from '@venizia/ignis-helpers';`",
      dependsOn: '@venizia/ignis',
      owner: '@venizia/ignis-helpers',
    },
    {
      id: 'web-storage',
      match: { type: 'member', objects: ['localStorage', 'sessionStorage'] },
      message:
        "Use `BrowserStorage` (or the `useStoredState` hook), not `localStorage` / `sessionStorage`: it never throws: `import { BrowserStorage } from '@venizia/ardor-kernel';`",
      dependsOn: '@venizia/ardor',
      owner: '@venizia/ardor-kernel',
    },
    {
      id: 'localhost-url',
      match: {
        type: 'literal',
        pattern: '^https?://(?:localhost|127\\.0\\.0\\.1)(?![\\w.-])',
        isFallbackOnly: true,
      },
      message:
        "Require the value instead, a `localhost` URL as a fallback is used wherever the setting is missing: `applicationEnvironment.getRequired(key)` (`import { applicationEnvironment } from '@venizia/ignis-helpers';`) or `RuntimeConfig.getRequired({ key })` (`import { RuntimeConfig } from '@venizia/ardor-kernel';`).",
    },
  ];
}

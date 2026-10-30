import type { INamespaceMapping } from '../mapping';

/**
 * Every specifier `@venizia/ignis-helpers` shows `isEmpty`, `omit`, `resolveValue` and
 * `resolveValueAsync` through: its root and `./common` (`src/common/resolvers.ts` re-exports them by
 * name, and now the two classes too). Neither `./core` nor any kernel entry re-exports them.
 */
const INVERSION_AND_HELPERS = [
  '@venizia/ignis-inversion',
  '@venizia/ignis-helpers',
  '@venizia/ignis-helpers/common',
];

/**
 * The functions of `@venizia/ignis-inversion` that moved into a class. Every one already took one
 * options object, so each entry only moves the callee (`keepsOptions`).
 *
 * Not here, they stay functions: `isClass` (a type guard), `inject` (decorator), `getError`,
 * `fromError`, `isApplicationError` (type guard), `isClassProvider` (type guard).
 */
export const INVERSION_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  {
    modules: INVERSION_AND_HELPERS,
    oldName: 'isEmpty',
    className: 'ObjectUtility',
    method: 'isEmpty',
    params: [],
    keepsOptions: true,
  },
  {
    modules: INVERSION_AND_HELPERS,
    oldName: 'omit',
    className: 'ObjectUtility',
    method: 'omit',
    params: [],
    keepsOptions: true,
  },
  {
    modules: INVERSION_AND_HELPERS,
    oldName: 'resolveValue',
    className: 'ResolverUtility',
    method: 'resolveValue',
    params: [],
    keepsOptions: true,
  },
  {
    modules: INVERSION_AND_HELPERS,
    oldName: 'resolveValueAsync',
    className: 'ResolverUtility',
    method: 'resolveValueAsync',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ['@venizia/ignis-inversion'],
    oldName: 'resolveInjectTarget',
    className: 'ResolverUtility',
    method: 'resolveInjectTarget',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ['@venizia/ignis-inversion'],
    oldName: 'verifyBindings',
    className: 'BindingVerifier',
    method: 'verify',
    params: [],
    keepsOptions: true,
  },
  {
    modules: ['@venizia/ignis-inversion'],
    oldName: 'assertBindingsResolve',
    className: 'BindingVerifier',
    method: 'assertResolve',
    params: [],
    keepsOptions: true,
  },
];

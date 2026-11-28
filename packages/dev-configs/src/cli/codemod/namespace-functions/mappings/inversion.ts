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
 * The type guards of `@venizia/ignis-inversion`, which keep their positional argument: `keepsOptions` moves only the
 * callee. `modules` lists the entries that exported the function as a value.
 */
export const INVERSION_GUARD_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  {
    modules: [
      '@venizia/ignis-inversion',
      '@venizia/ignis-kernel',
      '@venizia/ignis',
      '@venizia/ignis-helpers',
      '@venizia/ignis-helpers/common',
    ],
    oldName: 'isClass',
    className: 'ResolverUtility',
    method: 'isClass',
    params: [],
    keepsOptions: true,
    reusesTypeImport: true,
  },
  {
    modules: ['@venizia/ignis-inversion', '@venizia/ignis-kernel', '@venizia/ignis'],
    oldName: 'isClassProvider',
    className: 'Binding',
    method: 'isClassProvider',
    params: [],
    keepsOptions: true,
    reusesTypeImport: true,
  },
  {
    modules: ['@venizia/ignis-inversion', '@venizia/ignis-helpers', '@venizia/ignis-helpers/core'],
    oldName: 'isApplicationError',
    className: 'ApplicationError',
    method: 'isApplicationError',
    params: [],
    keepsOptions: true,
    reusesTypeImport: true,
  },
];

/**
 * The functions of `@venizia/ignis-inversion` that moved into a class. Every one already took one
 * options object, so each entry only moves the callee (`keepsOptions`).
 *
 * Not here, they stay functions: `inject` (decorator), `getError`, `fromError`.
 */
export const INVERSION_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  ...INVERSION_GUARD_MAPPINGS,
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
    // The kernel re-exports it by name (`helpers/inversion/index.ts`, `export *` up to its root), and
    // `@venizia/ignis` re-exports the kernel.
    modules: ['@venizia/ignis-inversion', '@venizia/ignis-kernel', '@venizia/ignis'],
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

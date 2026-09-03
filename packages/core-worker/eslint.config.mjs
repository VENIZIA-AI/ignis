import { eslintConfigs } from '@venizia/dev-configs';
import { builtinModules } from 'node:module';

/**
 * A browser Worker has no Node or Bun host. `tsconfig.build.json` sets `types: []`, which removes the
 * `Bun` namespace, but it cannot remove Node's globals: `ioredis` (reached through
 * `@venizia/ignis-helpers/core`) and `casbin` (reached through `@venizia/ignis-kernel`) both carry
 * `/// <reference types="node" />` in their published declarations, and a type-library reference from
 * a `.d.ts` is unconditional. So `process`, `Buffer`, `__dirname` and `setImmediate` all type-check
 * here no matter what the tsconfig says, and the editor offers them in autocomplete. These rules are
 * what fails the author on the forms below; `src/__tests__/browser-purity.test.ts` pins them.
 *
 * Two forms are invisible to them, by construction, and `make purity` is the backstop for both:
 *
 * - **Computed member access.** `no-restricted-globals` resolves identifiers, so `globalThis.process`
 *   is caught but `globalThis['process']` and `globalThis['Buffer']` are not.
 * - **A dynamic import with a non-literal specifier.** `import('node:fs')` is caught by
 *   `no-restricted-syntax` below, `import('fs')` by `n/prefer-node-protocol` from the shared preset,
 *   but `import(someVariable)` cannot be resolved statically by any rule.
 */
const NODE_HOST_GLOBALS = [
  { name: 'process', reason: 'read configuration from the application options or the Hono context' },
  { name: 'Buffer', reason: 'use Uint8Array' },
  { name: 'global', reason: 'use globalThis' },
  { name: '__dirname', reason: 'a Worker has no filesystem' },
  { name: '__filename', reason: 'a Worker has no filesystem' },
  { name: 'require', reason: 'use a static or dynamic import' },
  { name: 'module', reason: 'this package emits modules, not CommonJS wrappers' },
  { name: 'exports', reason: 'use an export statement' },
  { name: 'setImmediate', reason: 'use queueMicrotask or setTimeout' },
  { name: 'clearImmediate', reason: 'use clearTimeout' },
  { name: 'Bun', reason: 'there is no Bun runtime in a browser' },
];

/**
 * Derived, never hand-maintained. A literal list silently grows holes - `fs/promises`,
 * `string_decoder` and `diagnostics_channel` were all missing from the one this replaced, and the
 * only thing catching them was `n/prefer-node-protocol`, whose message is about the `node:` prefix
 * and says nothing about a browser.
 */
const NODE_BUILTIN_MODULES = builtinModules;

const RESTRICTED_HOST_SPECIFIER = /^(node|bun):/;

const browserPurity = {
  name: 'ignis/core-worker-browser-purity',
  // `.tsx` too: tsconfig.json sets `jsx: react-jsx` with `jsxImportSource: hono/jsx`, so a production
  // source can be a `.tsx` file, and a glob of `src/**/*.ts` would leave it with no rule at all.
  files: ['src/**/*.{ts,tsx,mts,cts}'],
  ignores: ['src/__tests__/**'],
  rules: {
    'no-restricted-globals': [
      'error',
      ...NODE_HOST_GLOBALS.map(({ name, reason }) => ({
        name,
        message: `'${name}' does not exist in a browser Worker - ${reason}.`,
      })),
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: NODE_BUILTIN_MODULES.map(name => ({
          name,
          message: `'${name}' is a Node builtin and a browser Worker cannot load it.`,
        })),
        patterns: [
          {
            group: ['node:*'],
            message: 'Node builtins do not exist in a browser Worker.',
          },
          {
            group: ['bun', 'bun:*'],
            message: 'Bun builtins do not exist in a browser Worker.',
          },
        ],
      },
    ],
    // `no-restricted-imports` registers no `ImportExpression` visitor, so a dynamic `import()` slips
    // past it entirely. This closes the literal case.
    'no-restricted-syntax': [
      'error',
      {
        selector: `ImportExpression[source.value=${RESTRICTED_HOST_SPECIFIER.toString()}]`,
        message: 'Node and Bun builtins do not exist in a browser Worker, dynamically imported or not.',
      },
    ],
  },
};

export default [...eslintConfigs, browserPurity];

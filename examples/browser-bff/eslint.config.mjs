import { eslintConfigs } from '@venizia/dev-configs';
import { builtinModules } from 'node:module';

/**
 * `tsconfig.app.json` leaves `node` out of `types`, and that is NOT a browser-purity guarantee -
 * `process.env` still type-checks under `src`, because node's globals arrive through
 * `/// <reference types="node" />` inside dependencies' own `.d.ts` files, which a tsconfig cannot
 * cancel. These rules are what actually fails the author, on the forms below.
 *
 * What no static rule here can reach, so nobody reads them as total:
 * - computed member access, `globalThis['process']` or `globalThis.Buffer`
 * - a variable specifier, `import(someName)`
 * - an inline `eslint-disable` comment
 * `make purity` is the backstop for all three at bundle level, except the computed form.
 *
 * The same block lives in `packages/core-worker/eslint.config.mjs`. Its home is
 * `@venizia/dev-configs` once a third consumer needs it; it is duplicated rather than hoisted while
 * that package sits outside this wave's scope.
 */
const NODE_HOST_GLOBALS = [
  { name: 'process', reason: 'read configuration from `import.meta.env` or the Hono context' },
  { name: 'Buffer', reason: 'use Uint8Array' },
  { name: 'global', reason: 'use globalThis' },
  { name: '__dirname', reason: 'a browser has no filesystem' },
  { name: '__filename', reason: 'a browser has no filesystem' },
  { name: 'require', reason: 'use a static or dynamic import' },
  { name: 'module', reason: 'this application is bundled as modules' },
  { name: 'exports', reason: 'use an export statement' },
  { name: 'setImmediate', reason: 'use queueMicrotask or setTimeout' },
  { name: 'clearImmediate', reason: 'use clearTimeout' },
  { name: 'Bun', reason: 'there is no Bun runtime in a browser' },
];

/**
 * Derived, never hand-maintained. A literal list silently grows holes - `fs/promises`,
 * `string_decoder` and `diagnostics_channel` were all missing from the first version of this, and the
 * only thing catching them was `n/prefer-node-protocol`, whose message is about the `node:` prefix and
 * says nothing about a browser.
 */
const NODE_BUILTIN_MODULES = builtinModules;

const RESTRICTED_HOST_SPECIFIER = /^(node|bun):/;

/** `vite.config.ts` is deliberately excluded: it runs in node and is the one file allowed to say so. */
const browserPurity = {
  name: 'ignis/browser-bff-purity',
  files: ['src/**/*.{ts,tsx,mts,cts}'],
  rules: {
    'no-restricted-globals': [
      'error',
      ...NODE_HOST_GLOBALS.map(({ name, reason }) => ({
        name,
        message: `'${name}' does not exist in a browser - ${reason}.`,
      })),
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: NODE_BUILTIN_MODULES.map(name => ({
          name,
          message: `'${name}' is a Node builtin and a browser cannot load it.`,
        })),
        patterns: [
          {
            group: ['node:*'],
            message: 'Node builtins do not exist in a browser.',
          },
          {
            group: ['bun', 'bun:*'],
            message: 'Bun builtins do not exist in a browser.',
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
        message: 'Node and Bun builtins do not exist in a browser, dynamically imported or not.',
      },
    ],
  },
};

export default [...eslintConfigs, browserPurity];

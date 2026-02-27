<div align="center">

# :fire: IGNIS - @venizia/dev-configs

**Shared ESLint, Prettier, and TypeScript configs for the Ignis ecosystem**

[![npm](https://img.shields.io/npm/v/@venizia/dev-configs.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/dev-configs)
[![License](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ESLint](https://img.shields.io/badge/ESLint-9.x-4B32C3.svg?style=flat-square&logo=eslint&logoColor=white)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/Prettier-3.x-F7B93E.svg?style=flat-square&logo=prettier&logoColor=black)](https://prettier.io/)

Single source of truth for development tooling across the entire Ignis monorepo. Flat ESLint config (v9+), Prettier formatting, and TypeScript compiler settings with `experimentalDecorators` + `emitDecoratorMetadata` enabled.

[Installation](#installation) &#8226; [Quick Start](#quick-start) &#8226; [API Reference](#eslint-configuration) &#8226; [Documentation](https://venizia-ai.github.io/ignis)

</div>

## Highlights

| | Feature | |
| :---: | :--- | :--- |
| **1** | **3-Line Setup** | Import and re-export -- ESLint, Prettier, and TypeScript ready |
| **2** | **Flat Config (ESLint v9+)** | Modern flat config format with composable layers |
| **3** | **Decorator Support** | `experimentalDecorators` + `emitDecoratorMetadata` pre-configured |
| **4** | **Consistent Formatting** | 100-char width, single quotes, trailing commas everywhere |

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [ESLint Configuration](#eslint-configuration)
  - [Architecture: Three-Layer Rule Stack](#architecture-three-layer-rule-stack)
  - [Layer 1: eslint-common (Foundation)](#layer-1-eslint-common-foundation)
  - [Layer 2: eslint-node (Node.js Specialization)](#layer-2-eslint-node-nodejs-specialization)
  - [Layer 3: dev-configs (Ignis Overrides)](#layer-3-dev-configs-ignis-overrides)
  - [Complete Rule Reference](#complete-rule-reference)
  - [Rule Examples: Pass vs Fail](#rule-examples-pass-vs-fail)
  - [Flat Config Format (ESLint v9+)](#flat-config-format-eslint-v9)
  - [Adding Project-Specific Overrides](#adding-project-specific-overrides)
  - [Adding File-Specific Overrides](#adding-file-specific-overrides)
- [Prettier Configuration](#prettier-configuration)
  - [Settings with Before/After Examples](#settings-with-beforeafter-examples)
  - [Overriding Prettier Settings](#overriding-prettier-settings)
  - [.prettierignore Patterns](#prettierignore-patterns)
- [TypeScript Configuration](#typescript-configuration)
  - [tsconfig.base.json](#tsconfigbasejson)
  - [tsconfig.common.json](#tsconfigcommonjson)
  - [Critical Flags for Decorator-Based DI](#critical-flags-for-decorator-based-di)
- [Consumption Pattern](#consumption-pattern)
- [Real-World Consumer Examples](#real-world-consumer-examples)
- [Setting Up a New Package](#setting-up-a-new-package)
- [Extending and Overriding](#extending-and-overriding)
- [IDE Integration](#ide-integration)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)
- [Version Compatibility](#version-compatibility)
- [Comparison with Alternatives](#comparison-with-alternatives)
- [Package Exports](#package-exports)
- [Important Notes](#important-notes)
- [License](#license)

---

## Installation

```bash
bun add -d @venizia/dev-configs
```

Peer dependencies -- install only the tools you intend to use:

```bash
bun add -d eslint@^9.0.0 prettier@^3.0.0 typescript@^5.0.0
```

All peer dependencies are marked optional, so you only need to install the ones relevant to your workflow.

---

## Quick Start

Three lines per config file -- that is all any consuming package needs:

**ESLint** (`eslint.config.mjs`):

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

**Prettier** (`.prettierrc.mjs`):

```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

**TypeScript** (`tsconfig.json`):

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

---

## ESLint Configuration

The ESLint configuration uses the **flat config format** (ESLint v9+) and is exported as a `Linter.Config[]` array.

### Architecture: Three-Layer Rule Stack

The final ESLint configuration is built by composing three layers, each applied in order. Later layers override earlier ones:

```
Layer 1: @minimaltech/eslint-common     (Foundation: JS recommended + Prettier + TS recommended + naming conventions)
    |
Layer 2: @minimaltech/eslint-node       (Node.js: LB4-derived rules + eslint-plugin-n + TS strictness adjustments)
    |
Layer 3: @venizia/dev-configs           (Ignis: relax no-explicit-any + add unicorn + enforce curly braces)
```

Each layer is a flat config array. The final export is the concatenation of all three, meaning rules defined later take precedence.

---

### Layer 1: eslint-common (Foundation)

Provided by `@minimaltech/eslint-common`. This layer establishes:

- **`@eslint/js` recommended** -- core JavaScript best-practice rules
- **`eslint-plugin-prettier/recommended`** -- runs Prettier as an ESLint rule and disables formatting rules that conflict with Prettier
- **`typescript-eslint` recommended** -- TypeScript-specific rules from the `@typescript-eslint` project

Key rules from this layer:

| Rule | Value | Purpose |
| :--- | :---- | :------ |
| `curly` | `["error", "all"]` | Braces required on all control flow |
| `prefer-const` | `"error"` | Must use `const` when variable is never reassigned |
| `no-restricted-imports` | Blocks `lodash` barrel import | Forces `import get from 'lodash/get'` for tree-shaking |
| `@typescript-eslint/no-explicit-any` | `"warn"` | Warns on `any` types (overridden later) |
| `@typescript-eslint/no-unused-vars` | `"warn"` | Warns on unused variables; `_` prefix suppresses |
| `@typescript-eslint/naming-convention` | Complex | Interfaces must have `I` prefix; type aliases must have `T` prefix or `Type`/`Like` suffix; booleans must have `is`/`has`/`should`/etc. prefix |

**File targeting:** Applies to `**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}`.

**Default ignores:** `node_modules/`, `*.d.ts`, `build/`, `dist/`, `release/`, `babel.config.*`, `.eslintrc.*`, `.prettierrc.*`, `eslint.config.*`.

---

### Layer 2: eslint-node (Node.js Specialization)

Provided by `@minimaltech/eslint-node`. Built on top of the common layer, this adds:

**LoopBack 4-derived rules (`lbRules`)** -- a comprehensive rule set originally from the LoopBack Next project, adapted for Ignis:

| Rule | Value | Purpose |
| :--- | :---- | :------ |
| `prefer-const` | `"error"` | Enforce immutable bindings |
| `no-unused-labels` | `"error"` | Disallow unused labels |
| `no-new-wrappers` | `"error"` | Disallow `new String()`, `new Number()`, etc. |
| `no-throw-literal` | `"error"` | Must throw `Error` objects, not strings |
| `no-unused-expressions` | `"error"` | Disallow expression statements with no side effects |
| `no-var` | `"error"` | Disallow `var`; use `let`/`const` |
| `eqeqeq` | `["error", "smart"]` | Require `===`/`!==` except for `null` checks |
| `no-void` | `"error"` | Disallow `void` operator |
| `no-caller` | `"error"` | Disallow `arguments.caller`/`arguments.callee` |
| `no-shadow` | `"error"` | Disallow variable shadowing |
| `@typescript-eslint/no-explicit-any` | `"error"` | Error on `any` (overridden by dev-configs) |
| `@typescript-eslint/no-unused-vars` | `"error"` (all vars, no args) | Error on unused variables |
| `@typescript-eslint/await-thenable` | `"error"` | Disallow `await` on non-Promise values |
| `@typescript-eslint/no-floating-promises` | `"error"` | Must handle or return Promises |
| `@typescript-eslint/no-misused-promises` | `"error"` | Prevent passing Promises where not expected |
| `@typescript-eslint/prefer-optional-chain` | `"error"` | Prefer `a?.b` over `a && a.b` |
| `@typescript-eslint/prefer-nullish-coalescing` | `"error"` | Prefer `a ?? b` over `a \|\| b` |
| `@typescript-eslint/return-await` | `"error"` | Require `return await` in try/catch |
| `@typescript-eslint/prefer-for-of` | `"error"` | Prefer `for...of` over indexed `for` loops |
| `@typescript-eslint/unified-signatures` | `"error"` | Merge overloaded signatures when possible |
| `@typescript-eslint/no-use-before-define` | `"error"` | Disallow use before declaration |
| `@typescript-eslint/naming-convention` | Complex | Overrides Layer 1 naming; allows `camelCase`, `PascalCase`, `UPPER_CASE` for variables/properties; `PascalCase` for types; allows leading underscore for private/protected members; allows `Mixin` suffix on PascalCase functions |

**Node.js-specific rules** via `eslint-plugin-n`:

| Rule | Value | Purpose |
| :--- | :---- | :------ |
| `n/prefer-node-protocol` | `"error"` | Require `node:` prefix: `import fs from 'node:fs'` |

**Relaxations applied at this layer:**

| Rule | Value | Purpose |
| :--- | :---- | :------ |
| `@typescript-eslint/no-inferrable-types` | `"off"` | Allow explicit types on initialized variables |
| `@typescript-eslint/no-misused-promises` | `"off"` | Re-disabled (was enabled in lbRules, turned off here) |
| `@typescript-eslint/ban-ts-comment` | `"off"` | Allow `@ts-ignore`, `@ts-expect-error` |
| Various legacy TS rules | `"off"` | Old rules no longer relevant in modern TS-ESLint |

---

### Layer 3: dev-configs (Ignis Overrides)

This is the final layer defined in `@venizia/dev-configs` itself:

```typescript
import mtLinterConfs from '@minimaltech/eslint-node';
import type { Linter } from 'eslint';
import unicorn from 'eslint-plugin-unicorn';

export const eslintConfigs: Linter.Config[] = [
  ...mtLinterConfs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    plugins: { unicorn },
    rules: {
      curly: ['error', 'all'],
      'unicorn/switch-case-braces': ['error', 'always'],
    },
  },
];
```

**Config object 1** -- overrides `@typescript-eslint/no-explicit-any` from `"error"` (Layer 2) to `"off"`:

| Rule | Value | Purpose |
| :--- | :---- | :------ |
| `@typescript-eslint/no-explicit-any` | `"off"` | Pragmatic decision. Framework-level code dealing with metadata, decorators, and dynamic DI resolution frequently requires `any`. |

**Config object 2** -- adds `eslint-plugin-unicorn` and enforces brace rules:

| Rule | Value | Purpose |
| :--- | :---- | :------ |
| `curly` | `["error", "all"]` | Re-enforces braces on all control flow (already set in Layer 1, repeated for clarity) |
| `unicorn/switch-case-braces` | `["error", "always"]` | Every `case`/`default` in a `switch` must be wrapped in braces |

---

### Complete Rule Reference

The following table shows every explicitly configured rule across all three layers, with the **final effective value** after all overrides:

| Rule | Final Value | Set By |
| :--- | :---------- | :----- |
| **Core JavaScript** | | |
| `curly` | `["error", "all"]` | Layer 1 + 3 |
| `prefer-const` | `"error"` | Layer 1 + 2 |
| `eqeqeq` | `["error", "smart"]` | Layer 2 |
| `no-var` | `"error"` | Layer 2 |
| `no-void` | `"error"` | Layer 2 |
| `no-caller` | `"error"` | Layer 2 |
| `no-shadow` | `"error"` | Layer 2 |
| `no-throw-literal` | `"error"` | Layer 2 |
| `no-new-wrappers` | `"error"` | Layer 2 |
| `no-unused-labels` | `"error"` | Layer 2 |
| `no-unused-expressions` | `"error"` | Layer 2 |
| `no-restricted-imports` | Blocks `lodash` barrel | Layer 1 |
| `no-console` | `"off"` | Layer 2 |
| `no-undef` | `"off"` | Layer 1 |
| `no-constant-condition` | `"off"` | Layer 1 |
| `no-mixed-operators` | `"off"` | Layer 2 |
| `no-inner-declarations` | `"off"` | Layer 2 |
| `no-dupe-class-members` | `"off"` | Layer 2 |
| `no-redeclare` | `"off"` | Layer 2 |
| `no-invalid-this` | `"off"` | Layer 2 |
| `no-return-await` | `"off"` | Layer 2 |
| `camelcase` | `"off"` | Layer 2 |
| `prefer-promise-reject-errors` | `"off"` | Layer 1 |
| **TypeScript** | | |
| `@typescript-eslint/no-explicit-any` | `"off"` | Layer 3 (override) |
| `@typescript-eslint/no-unused-vars` | `["error", ...]` | Layer 2 (override) |
| `@typescript-eslint/naming-convention` | Complex (see above) | Layer 2 (override) |
| `@typescript-eslint/await-thenable` | `"error"` | Layer 2 |
| `@typescript-eslint/no-floating-promises` | `"error"` | Layer 2 |
| `@typescript-eslint/prefer-optional-chain` | `"error"` | Layer 2 |
| `@typescript-eslint/prefer-nullish-coalescing` | `"error"` | Layer 2 |
| `@typescript-eslint/return-await` | `"error"` | Layer 2 |
| `@typescript-eslint/prefer-for-of` | `"error"` | Layer 2 |
| `@typescript-eslint/unified-signatures` | `"error"` | Layer 2 |
| `@typescript-eslint/no-use-before-define` | `"error"` | Layer 2 |
| `@typescript-eslint/no-non-null-asserted-optional-chain` | `"error"` | Layer 2 |
| `@typescript-eslint/adjacent-overload-signatures` | `"error"` | Layer 2 |
| `@typescript-eslint/no-misused-new` | `"error"` | Layer 2 |
| `@typescript-eslint/no-invalid-this` | `"error"` | Layer 2 |
| `@typescript-eslint/no-shadow` | `"error"` | Layer 2 |
| `@typescript-eslint/no-misused-promises` | `"off"` | Layer 2 (node override) |
| `@typescript-eslint/no-inferrable-types` | `"off"` | Layer 2 (node) |
| `@typescript-eslint/ban-ts-comment` | `"off"` | Layer 2 (node) |
| `@typescript-eslint/no-non-null-assertion` | `"off"` | Layer 2 |
| `@typescript-eslint/explicit-function-return-type` | `"off"` | Layer 1 + 2 |
| `@typescript-eslint/no-namespace` | `"off"` | Layer 2 |
| `@typescript-eslint/no-require-imports` | `"off"` | Layer 1 + 2 |
| `@typescript-eslint/no-empty-function` | `"off"` | Layer 2 |
| `@typescript-eslint/consistent-type-assertions` | `"off"` | Layer 2 |
| `@typescript-eslint/explicit-member-accessibility` | `"off"` | Layer 2 |
| `@typescript-eslint/no-empty-object-type` | `"off"` | Layer 1 |
| `@typescript-eslint/no-unsafe-function-type` | `"off"` | Layer 1 |
| `@typescript-eslint/no-extraneous-class` | `"off"` | Layer 1 |
| `@typescript-eslint/strict-boolean-expressions` | `"off"` | Layer 1 |
| **Node.js** | | |
| `n/prefer-node-protocol` | `"error"` | Layer 2 |
| **Unicorn** | | |
| `unicorn/switch-case-braces` | `["error", "always"]` | Layer 3 |

---

### Rule Examples: Pass vs Fail

#### `curly: ["error", "all"]` -- Braces Required on All Control Flow

```typescript
// PASSES -- braces on every branch
if (user.isAdmin) {
  grantAccess();
}

if (count > 0) {
  process();
} else {
  skip();
}

for (const item of items) {
  transform(item);
}

while (hasNext()) {
  advance();
}
```

```typescript
// FAILS -- missing braces
if (user.isAdmin) grantAccess();           // Error: Expected { after 'if' condition

if (count > 0) process();                  // Error: Expected { after 'if' condition
else skip();                                // Error: Expected { after 'else'

for (const item of items) transform(item); // Error: Expected { after 'for'

while (hasNext()) advance();               // Error: Expected { after 'while' condition
```

---

#### `@typescript-eslint/no-explicit-any: off` -- Why This Is Pragmatic

In framework-level code, `any` is sometimes unavoidable when dealing with decorator metadata, dynamic DI resolution, and generic container patterns:

```typescript
// These patterns are common in Ignis and would be painful to type perfectly:

// Decorator factory that accepts any class
function controller(opts: { path: string }) {
  return function (target: any) {  // 'any' is acceptable here
    MetadataRegistry.define({ target, key: 'controller', value: opts });
  };
}

// IoC container resolving unknown types at runtime
class Container {
  get<T>({ key }: { key: string }): T {
    const binding = this.bindings.get(key);
    return binding?.getValue(this) as any;  // Runtime type, compile-time unknown
  }
}

// Dynamic metadata inspection
const paramTypes: any[] = Reflect.getMetadata('design:paramtypes', target) ?? [];
```

While `any` is turned off globally, individual packages can re-enable it:

```javascript
// eslint.config.mjs -- stricter for application code
export default [
  ...eslintConfigs,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
];
```

---

#### `unicorn/switch-case-braces: ["error", "always"]` -- Case Clause Braces

```typescript
// PASSES -- every case wrapped in braces
switch (action.type) {
  case 'CREATE': {
    const entity = buildEntity(action.payload);
    await repository.create({ data: entity });
    break;
  }
  case 'UPDATE': {
    const changes = diffEntity(action.payload);
    await repository.updateById({ id: action.id, data: changes });
    break;
  }
  default: {
    throw getError({ message: `Unknown action: ${action.type}`, statusCode: 400 });
  }
}
```

```typescript
// FAILS -- case clauses without braces
switch (action.type) {
  case 'CREATE':                   // Error: Missing braces around case clause
    const entity = buildEntity(action.payload);
    await repository.create({ data: entity });
    break;
  case 'UPDATE':                   // Error: Missing braces around case clause
    const changes = diffEntity(action.payload);  // 'changes' leaks into 'CREATE' scope!
    await repository.updateById({ id: action.id, data: changes });
    break;
  default:                         // Error: Missing braces around case clause
    throw getError({ message: `Unknown action: ${action.type}`, statusCode: 400 });
}
```

Without braces, `const entity` and `const changes` share the same lexical scope. This can cause `SyntaxError: Identifier already declared` or subtle bugs where variables from one case are visible in another.

---

#### `n/prefer-node-protocol: "error"` -- Require `node:` Prefix

```typescript
// PASSES
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { pipeline } from 'node:stream/promises';
```

```typescript
// FAILS
import fs from 'fs';          // Error: Prefer 'node:fs' over 'fs'
import path from 'path';      // Error: Prefer 'node:path' over 'path'
import { createServer } from 'http';  // Error: Prefer 'node:http' over 'http'
```

---

#### `eqeqeq: ["error", "smart"]` -- Strict Equality with Exceptions

```typescript
// PASSES
if (user.role === 'admin') { /* ... */ }
if (count !== 0) { /* ... */ }
if (value == null) { /* ... */ }       // 'smart' mode: allows == null (checks null AND undefined)
if (typeof x === 'string') { /* ... */ }

// FAILS
if (user.role == 'admin') { /* ... */ }  // Error: Expected '===' but found '=='
if (count != 0) { /* ... */ }            // Error: Expected '!==' but found '!='
```

---

### Flat Config Format (ESLint v9+)

ESLint v9 introduced the **flat config** format, replacing the legacy `.eslintrc` approach. Understanding the difference is important when working with `@venizia/dev-configs`:

**Flat config (ESLint v9+ -- what we use):**

```javascript
// eslint.config.mjs -- a simple array of config objects
export default [
  {
    // Config object 1: applies to all files
    rules: { 'no-console': 'warn' },
  },
  {
    // Config object 2: applies only to test files
    files: ['**/*.test.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Config object 3: ignore patterns
    ignores: ['dist/**'],
  },
];
```

Key differences from the legacy format:

| Aspect | Legacy `.eslintrc` | Flat Config |
| :----- | :----------------- | :---------- |
| File name | `.eslintrc.json`, `.eslintrc.js` | `eslint.config.mjs` |
| Structure | Single object with `extends`, `overrides` | Array of config objects |
| Plugin loading | `plugins: ['unicorn']` (string name) | `plugins: { unicorn: importedPlugin }` (object reference) |
| Inheritance | `extends: ['config-name']` | `...spread` array |
| File targeting | `overrides: [{ files, rules }]` | Each array element can have `files` |
| Ignore patterns | `.eslintignore` file | `ignores` key in a config object |

**Why flat config matters for `@venizia/dev-configs`:** The exported `eslintConfigs` is already a `Linter.Config[]` array. To extend it, you spread it into your own array and append additional config objects. No `extends` keyword, no magic resolution -- just arrays and objects.

---

### Adding Project-Specific Overrides

Since the config is a standard flat config array, you can append additional config objects after spreading:

```javascript
// eslint.config.mjs
import { eslintConfigs } from '@venizia/dev-configs';

export default [
  ...eslintConfigs,
  {
    rules: {
      // Stricter rules for this specific package
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Package-specific ignore patterns
    ignores: ['generated/**', 'migrations/**'],
  },
];
```

---

### Adding File-Specific Overrides

You can target specific file patterns with different rules:

```javascript
// eslint.config.mjs
import { eslintConfigs } from '@venizia/dev-configs';

export default [
  ...eslintConfigs,

  // Relax rules for test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      'no-unused-expressions': 'off',
    },
  },

  // Stricter rules for controller files
  {
    files: ['**/controllers/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Allow require() in config files
  {
    files: ['*.config.mjs', '*.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
```

---

## Prettier Configuration

All formatting settings are exported as a `Config` object from Prettier's type definitions.

### Source

```typescript
import type { Config } from 'prettier';

export const prettierConfigs: Config = {
  bracketSpacing: true,
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  trailingComma: 'all',
  arrowParens: 'avoid',
  semi: true,
};
```

---

### Settings with Before/After Examples

#### `printWidth: 100` -- Maximum Line Length

Wider than the 80-character default. This reduces unnecessary line breaks in TypeScript generics, decorator signatures, and long import paths.

```typescript
// With printWidth: 80 (default) -- forces wrapping
const result = await this.userRepository.find({
  filter: {
    where: { isActive: true },
  },
});

// With printWidth: 100 (our setting) -- fits on fewer lines
const result = await this.userRepository.find({ filter: { where: { isActive: true } } });
```

```typescript
// With printWidth: 80 -- long generic signatures break awkwardly
export class DefaultCRUDRepository<
  T extends Record<string, unknown>,
> extends PersistableRepository<T> {

// With printWidth: 100 -- fits naturally
export class DefaultCRUDRepository<T extends Record<string, unknown>> extends PersistableRepository<T> {
```

---

#### `tabWidth: 2` -- Indentation

Two spaces per indentation level. Consistent with most Node.js/TypeScript projects.

```typescript
// tabWidth: 2
class UserController extends BaseController {
  constructor(
    @inject({ key: 'services.UserService' }) private userService: UserService,
  ) {
    super();
  }
}
```

```typescript
// tabWidth: 4 (NOT our setting)
class UserController extends BaseController {
    constructor(
        @inject({ key: 'services.UserService' }) private userService: UserService,
    ) {
        super();
    }
}
```

---

#### `singleQuote: true` -- Quote Style

Single quotes for string literals. Double quotes are still used in JSX attributes and when a string contains a single quote.

```typescript
// singleQuote: true (our setting)
import { controller } from '@venizia/ignis';
const name = 'hello';
const message = "it's a test";   // Double quotes when string contains single quote

// singleQuote: false (NOT our setting)
import { controller } from "@venizia/ignis";
const name = "hello";
```

---

#### `semi: true` -- Semicolons

Always include semicolons at the end of statements. Prevents ASI (Automatic Semicolon Insertion) edge cases.

```typescript
// semi: true (our setting)
const port = 3000;
const host = 'localhost';
app.start({ port, host });

// semi: false (NOT our setting)
const port = 3000
const host = 'localhost'
app.start({ port, host })
```

---

#### `trailingComma: "all"` -- Trailing Commas

Trailing commas in objects, arrays, function parameters, and type parameters wherever valid in ES5+. This produces cleaner git diffs because adding a new item only changes one line instead of two.

```typescript
// trailingComma: "all" (our setting)
const config = {
  host: 'localhost',
  port: 3000,
  debug: true,    // <-- trailing comma
};

function createUser(
  name: string,
  email: string,
  role: string,   // <-- trailing comma
) {
  // ...
}

const items = [
  'controllers',
  'services',
  'repositories',  // <-- trailing comma
];
```

```typescript
// trailingComma: "none" (NOT our setting)
const config = {
  host: 'localhost',
  port: 3000,
  debug: true     // no trailing comma -- adding a new property changes this line too
};
```

**Git diff advantage:**

```diff
# With trailing commas -- adding a property is a 1-line diff
  const config = {
    host: 'localhost',
    port: 3000,
    debug: true,
+   verbose: false,
  };

# Without trailing commas -- adding a property is a 2-line diff
  const config = {
    host: 'localhost',
    port: 3000,
-   debug: true
+   debug: true,
+   verbose: false
  };
```

---

#### `arrowParens: "avoid"` -- Arrow Function Parentheses

Omit parentheses around a sole arrow function parameter when possible.

```typescript
// arrowParens: "avoid" (our setting)
const double = x => x * 2;
const greet = name => `Hello, ${name}`;
items.map(item => item.id);
items.filter(item => item.isActive);

// Multiple parameters always need parens (regardless of setting)
const add = (a, b) => a + b;

// Type annotations always need parens (regardless of setting)
const parse = (input: string) => JSON.parse(input);
```

```typescript
// arrowParens: "always" (NOT our setting)
const double = (x) => x * 2;
const greet = (name) => `Hello, ${name}`;
items.map((item) => item.id);
items.filter((item) => item.isActive);
```

---

#### `bracketSpacing: true` -- Object Literal Spacing

Spaces inside object literal braces.

```typescript
// bracketSpacing: true (our setting)
const point = { x: 10, y: 20 };
const { name, age } = user;
import { controller, inject } from '@venizia/ignis';

// bracketSpacing: false (NOT our setting)
const point = {x: 10, y: 20};
const {name, age} = user;
import {controller, inject} from '@venizia/ignis';
```

---

### Overriding Prettier Settings

Import and spread to override specific settings:

```javascript
// .prettierrc.mjs
import { prettierConfigs } from '@venizia/dev-configs';

export default {
  ...prettierConfigs,
  printWidth: 120,         // Wider lines for this project
  arrowParens: 'always',   // Always wrap arrow params
};
```

---

### .prettierignore Patterns

Prettier does not have a config for ignore patterns in the shared config object. Create a `.prettierignore` file in your package root:

```
# Build output
dist/
build/
coverage/

# Dependencies
node_modules/

# Generated files
*.tsbuildinfo
*.generated.ts

# Lock files
bun.lockb

# Assets
*.min.js
*.min.css
```

---

## TypeScript Configuration

Two TypeScript config files are provided via package exports. They are consumed through the `"extends"` field in `tsconfig.json`.

### tsconfig.base.json

The comprehensive base configuration containing all compiler options. Located at `tsconfig/tsconfig.base.json` and exported as `@venizia/dev-configs/tsconfig.base.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false,

    "module": "Node16",
    "moduleResolution": "node16",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "isolatedModules": false,
    "forceConsistentCasingInFileNames": true,

    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": false,
    "importHelpers": false,
    "downlevelIteration": true,
    "preserveConstEnums": true,

    "strict": true,
    "noImplicitAny": false,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": false,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": false,
    "alwaysStrict": true,

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": false,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": false,
    "noImplicitOverride": true,
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,

    "incremental": true,
    "skipLibCheck": true,
    "noEmitOnError": true
  },
  "exclude": [
    "node_modules",
    "dist",
    "build",
    "coverage",
    "**/*.spec.ts",
    "**/*.test.ts",
    "**/__tests__/**"
  ]
}
```

---

#### Compiler Options Reference

**Language and Environment**

| Option | Value | What It Does | Why This Value | What Breaks If Changed |
| :----- | :---- | :----------- | :------------- | :--------------------- |
| `target` | `ES2022` | Sets the JavaScript version for emit output. | ES2022 provides native `class`, `async/await`, `top-level await`, private class fields, and `Array.at()` without downleveling. Bun and modern Node.js fully support ES2022. | Lowering to ES5/ES6 introduces unnecessary transpilation overhead. Raising to ESNext may use features not yet stable in all runtimes. |
| `lib` | `["ES2022"]` | Includes type definitions for ES2022 standard library APIs (`structuredClone`, `Array.at()`, `Object.hasOwn()`, `Error.cause`, etc.). | Matches the `target` to ensure type-checked APIs match the emitted code. | Removing this causes TypeScript to not recognize modern APIs like `structuredClone`. Adding `"DOM"` would introduce browser-specific types (e.g., `window`, `document`) that do not exist in Node.js/Bun. |
| `experimentalDecorators` | `true` | **CRITICAL.** Enables the legacy/experimental decorator syntax (`@decorator`) used by Ignis for DI, controllers, models, and repositories. | See [Critical Flags](#critical-flags-for-decorator-based-di). | All Ignis decorators fail to compile. |
| `emitDecoratorMetadata` | `true` | **CRITICAL.** Emits design-time type metadata via `Reflect.metadata()`. | See [Critical Flags](#critical-flags-for-decorator-based-di). | DI container cannot resolve constructor parameter types. |
| `useDefineForClassFields` | `false` | **CRITICAL.** Uses assignment semantics for class fields instead of `Object.defineProperty()`. | See [Critical Flags](#critical-flags-for-decorator-based-di). | Decorator-based property injection is overwritten by defineProperty. |

**Modules**

| Option | Value | What It Does | Why This Value | What Breaks If Changed |
| :----- | :---- | :----------- | :------------- | :--------------------- |
| `module` | `Node16` | Sets the module system for emitted code. | Node16 provides full ESM and CJS interop with `package.json` `"type"` field support. Matches the target Node.js/Bun environment. | Changing to `CommonJS` loses ESM support. Changing to `ESNext` loses CJS interop. |
| `moduleResolution` | `node16` | Controls how TypeScript resolves `import` paths to files. | Supports `package.json` `"exports"` field, conditional exports, and the `#imports` private imports pattern. | Changing to `node` (legacy) ignores `"exports"` field in `package.json`, causing resolution failures for modern packages. |
| `resolveJsonModule` | `true` | Allows importing `.json` files with full type inference. | Used for importing `package.json` and configuration files. | `import pkg from './package.json'` stops working. |
| `allowSyntheticDefaultImports` | `true` | Allows `import foo from 'module'` even when the module has no explicit `default` export. | Many CJS packages (e.g., `express`, `lodash`) do not have default exports but are commonly imported this way. | `import _ from 'lodash/get'` and similar patterns produce type errors. |
| `esModuleInterop` | `true` | Emits `__importDefault` and `__importStar` helpers for correct CJS/ESM interop at runtime. | Without this, `import` of CJS modules may resolve to `{ default: module }` instead of `module` directly. | Default imports from CJS modules break at runtime (the module object itself becomes `{ default: ... }`). |
| `isolatedModules` | `false` | When `true`, restricts features that require cross-file analysis (const enums, namespace merging). | Ignis uses `const enum` for binding scopes and namespace merging for type augmentation. These features require cross-file compilation. | Enabling this would disallow `const enum` usage in `@venizia/ignis-inversion` and related packages. |
| `forceConsistentCasingInFileNames` | `true` | Errors on imports that do not match the file system's actual casing. | Prevents cross-platform bugs where `import './UserService'` works on macOS (case-insensitive) but fails on Linux (case-sensitive). | Disabling this allows case mismatches that cause runtime `MODULE_NOT_FOUND` errors on Linux CI servers. |

**Emit**

| Option | Value | What It Does | Why This Value | What Breaks If Changed |
| :----- | :---- | :----------- | :------------- | :--------------------- |
| `declaration` | `true` | Generates `.d.ts` type declaration files alongside JavaScript output. | Required for packages consumed as dependencies so that consumers get type information. | Downstream packages lose all type information and IntelliSense. |
| `declarationMap` | `true` | Generates `.d.ts.map` files mapping declarations back to original `.ts` source. | Enables "Go to Definition" in IDEs to navigate to original TypeScript source instead of the `.d.ts` file. | IDE "Go to Definition" lands on `.d.ts` stubs instead of real source code. |
| `sourceMap` | `true` | Generates `.js.map` files for debugging. | Allows debuggers and stack traces to show original TypeScript source locations instead of compiled JavaScript. | Stack traces and breakpoints reference compiled JS line numbers, making debugging harder. |
| `removeComments` | `false` | Preserves comments in output files. | Keeps JSDoc comments in `.d.ts` files, which IDEs display as hover documentation. | Hover documentation in IDEs for framework APIs disappears. |
| `importHelpers` | `false` | When `true`, imports shared helper functions from `tslib` instead of inlining them per file. | Keeps each file self-contained without requiring `tslib` as a dependency. With `target: ES2022`, very few helpers are needed anyway. | Enabling this requires adding `tslib` to dependencies. |
| `downlevelIteration` | `true` | Full support for iteration protocols on `for...of`, spread (`...`), and destructuring when targeting older runtimes. | Ensures `for (const x of generator())` works correctly with custom iterables. With ES2022 target, this has minimal runtime cost. | Spread and destructuring on non-Array iterables (Map, Set, generators) may produce incorrect code. |
| `preserveConstEnums` | `true` | Keeps `const enum` declarations in output instead of inlining values. | Required for `.d.ts` file compatibility -- inlined enums cannot be re-exported in declaration files. | Consumers of the package cannot reference `const enum` values from their own code. |
| `noEmitOnError` | `true` | Prevents emitting output files if any type errors exist. | Prevents shipping builds with type errors. A broken build should fail loudly. | Build output may contain code with type errors, leading to runtime failures that should have been caught at compile time. |

**Type Checking -- Strict Mode (Balanced for Production)**

| Option | Value | What It Does | Why This Value | What Breaks If Changed |
| :----- | :---- | :----------- | :------------- | :--------------------- |
| `strict` | `true` | Enables all strict type-checking options as a baseline. Individual overrides below relax specific checks. | Maximum type safety as the default, with targeted relaxations for framework patterns. | Disabling this removes all strict checks at once, dramatically reducing type safety. |
| `noImplicitAny` | `false` | Allows variables and parameters to implicitly have the `any` type when TypeScript cannot infer a more specific type. | Pragmatic choice. Framework code dealing with decorator metadata (`Reflect.getMetadata`) and dynamic DI patterns frequently encounters values with no inferrable type. | Enabling this would require explicit type annotations on every decorator metadata access and dynamic container resolution, adding significant boilerplate to framework internals. |
| `strictNullChecks` | `true` | Makes `null` and `undefined` their own distinct types rather than assignable to everything. | Prevents the most common class of runtime errors (`Cannot read property of null/undefined`). | Disabling this allows `null` to be assigned anywhere, removing compile-time null safety. |
| `strictFunctionTypes` | `true` | Enforces contravariant function parameter type checking. | Catches type-unsafe function assignments like passing `(animal: Dog) => void` where `(animal: Animal) => void` is expected. | Disabling this allows unsound function type assignments that can cause runtime type errors. |
| `strictBindCallApply` | `true` | Enables strict type checking on `bind`, `call`, and `apply` methods. | Catches incorrect argument types when using `.call()` and `.apply()`. | Disabling this allows `fn.call(null, wrongArgType)` to pass type checking. |
| `strictPropertyInitialization` | `false` | When `true`, requires all class properties to be initialized in the constructor or with a default value. | **Disabled for DI.** Properties injected via `@inject` decorators are set by the IoC container, not in the constructor body. Enabling this would require `!` (definite assignment assertion) on every injected property. | Enabling this would require adding `!` to every `@inject`-decorated property: `@inject({ key }) private service!: Service`. |
| `noImplicitThis` | `true` | Errors when `this` has an implicit `any` type. | Catches bugs where `this` is used in a context where its type is ambiguous (e.g., standalone functions passed as callbacks). | Disabling this allows `this` to silently become `any` in ambiguous contexts. |
| `useUnknownInCatchVariables` | `false` | When `true`, types `catch` clause variables as `unknown` instead of `any`. | Simplifies error handling. Framework code frequently catches errors and accesses `.message`, `.statusCode`, etc. without narrowing. | Enabling this would require `if (error instanceof Error)` guards in every `catch` block throughout the codebase. |
| `alwaysStrict` | `true` | Emits `"use strict"` directive in every output file. | Ensures all generated JavaScript runs in strict mode, which prevents common JavaScript pitfalls. | Disabling this allows sloppy mode, which permits silent errors and behaviors like implicit global variable creation. |

**Additional Checks**

| Option | Value | What It Does | Why This Value | What Breaks If Changed |
| :----- | :---- | :----------- | :------------- | :--------------------- |
| `noUnusedLocals` | `true` | Errors on declared but unused local variables. | Keeps code clean and prevents dead code accumulation. | Disabling this allows unused variables to accumulate silently. |
| `noUnusedParameters` | `true` | Errors on declared but unused function parameters. Prefix with `_` to suppress. | Catches dead parameters that may indicate incomplete refactoring. The `_` prefix convention explicitly marks intentionally unused params. | Disabling this allows function signatures to diverge from implementation. |
| `noImplicitReturns` | `false` | When `true`, errors when not all code paths return a value. | Disabled because many methods intentionally return `void` from some branches (e.g., early return guards). | Enabling this would require explicit `return undefined` in many guard-clause patterns. |
| `noFallthroughCasesInSwitch` | `true` | Errors on `switch` cases that fall through without `break` or `return`. | Prevents accidental fallthrough bugs. Intentional fallthrough must use `// falls through` comment or empty case body. | Disabling this allows silent fallthrough, a common source of bugs. |
| `noUncheckedIndexedAccess` | `false` | When `true`, adds `undefined` to the type of index signature access (`obj[key]` becomes `T | undefined`). | Disabled because framework-level dynamic access patterns (binding maps, metadata registries) would require excessive null checking. | Enabling this would require null guards on every `container.bindings.get(key)`, `metadata[prop]`, etc. |
| `noImplicitOverride` | `true` | Requires the `override` keyword when overriding base class methods. | Makes the inheritance chain explicit. Prevents accidentally overriding a base class method and catches renames in base classes. | Disabling this allows silent overrides that may break when the base class changes. |
| `allowUnusedLabels` | `false` | Errors on declared but unused labels. | Unused labels are almost always mistakes. | Disabling this allows dead labels to accumulate. |
| `allowUnreachableCode` | `false` | Errors on unreachable code (code after `return`, `throw`, etc.). | Dead code indicates logic errors or incomplete refactoring. | Disabling this allows dead code to accumulate silently. |

**Performance**

| Option | Value | What It Does | Why This Value | What Breaks If Changed |
| :----- | :---- | :----------- | :------------- | :--------------------- |
| `incremental` | `true` | Stores build state in `.tsbuildinfo` files and only recompiles changed files. | Significantly speeds up rebuilds in the monorepo. First build is the same speed; subsequent builds only process changed files. | Disabling this forces full recompilation on every build, which is noticeably slower in a 50k+ LOC monorepo. |
| `skipLibCheck` | `true` | Skips type checking of `.d.ts` files from `node_modules`. | Dramatically reduces build times. Type errors in third-party `.d.ts` files are not actionable anyway. | Disabling this adds seconds to every build for no practical benefit, and may surface false positives from poorly-typed third-party packages. |

**Default Excludes**

The base config excludes the following from compilation:

- `node_modules` -- third-party dependencies
- `dist` -- build output directory
- `build` -- alternative build output directory
- `coverage` -- test coverage reports
- `**/*.spec.ts`, `**/*.test.ts`, `**/__tests__/**` -- test files (compiled separately by test runners)

---

### tsconfig.common.json

The consumer-facing configuration that most packages should extend. Located at `tsconfig/tsconfig.common.json` and exported as `@venizia/dev-configs/tsconfig.common.json`.

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "nodenext",
    "moduleResolution": "nodenext"
  },
  "ts-node": {
    "transpileOnly": true
  }
}
```

This config extends `tsconfig.base.json` and makes two adjustments:

| Override | Base Value | Common Value | Rationale |
| :------- | :--------- | :----------- | :-------- |
| `module` | `Node16` | `nodenext` | Uses the latest Node.js module resolution. `nodenext` tracks the most current Node.js behavior and will adopt future changes automatically. While `Node16` is frozen to Node 16 semantics, `nodenext` evolves with the Node.js release cycle. |
| `moduleResolution` | `node16` | `nodenext` | Matching module resolution strategy for `nodenext` module mode. Must always match the `module` setting. |

**The `ts-node` section:**

```json
{
  "ts-node": {
    "transpileOnly": true
  }
}
```

This configures `ts-node` (when used during development) to run in `transpileOnly` mode:

- **What it does:** Skips type checking at runtime, only transpiling TypeScript to JavaScript.
- **Why:** Type checking at runtime via `ts-node` is slow and redundant -- the IDE and `tsc` build step already catch type errors. `transpileOnly` makes `ts-node` execution near-instant.
- **When it matters:** When running scripts directly with `ts-node`, or when tools like Drizzle Kit load TypeScript config files (e.g., `drizzle-kit push --config=src/migration.ts`).

**Use `tsconfig.common.json` unless you have a specific reason to extend `tsconfig.base.json` directly.**

---

### Critical Flags for Decorator-Based DI

Three TypeScript compiler options are **absolutely essential** for the Ignis decorator-based dependency injection system to function. Changing any of these will break the entire framework.

#### `experimentalDecorators: true`

Enables the TypeScript experimental decorator syntax used throughout Ignis:

```typescript
@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor(
    @inject({ key: 'services.UserService' }) private userService: UserService,
  ) {
    super();
  }
}
```

Without this flag, TypeScript will emit a compilation error on every decorator:

```
error TS1219: Experimental support for decorators is a feature that is subject
to change in a future release. Set the 'experimentalDecorators' option in your
'tsconfig' or 'jsconfig' to remove this error.
```

The following decorators all require this flag: `@controller`, `@inject`, `@injectable`, `@repository`, `@datasource`, `@service`, `@model`, `@get`, `@post`, `@put`, `@patch`, `@del`, `@api`.

**Note on TC39 decorators:** TypeScript 5.0+ supports the new TC39 stage 3 decorator proposal (without `experimentalDecorators`). However, the TC39 decorators do NOT support `emitDecoratorMetadata`, which Ignis relies on for automatic DI resolution. Ignis intentionally uses the legacy/experimental decorator syntax for this reason.

---

#### `emitDecoratorMetadata: true`

Instructs TypeScript to emit design-time type information as metadata using `Reflect.metadata()`. This is what allows the IoC container (`@venizia/ignis-inversion`) to inspect constructor parameter types at runtime and automatically resolve dependencies.

When this flag is enabled, TypeScript emits additional metadata for decorated classes:

```typescript
// Source code:
@injectable()
class UserService {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private repo: UserRepository,
  ) {}
}

// TypeScript emits (simplified):
UserService = __decorate([
  injectable(),
  __metadata("design:paramtypes", [UserRepository])  // <-- This is emitDecoratorMetadata
], UserService);
```

The `design:paramtypes` metadata tells the DI container: "The first constructor parameter should be of type `UserRepository`." The container uses this to:

1. Look up the binding for `UserRepository` in its registry
2. Instantiate or retrieve the cached `UserRepository` instance
3. Pass it as the first constructor argument

Without this flag:

- `Reflect.getMetadata('design:paramtypes', UserService)` returns `undefined`
- The DI container cannot determine what types the constructor expects
- All automatic constructor injection silently fails
- `@inject` decorators lose their type-resolution capability

---

#### `useDefineForClassFields: false`

Controls how TypeScript initializes class fields. This flag has a subtle but critical interaction with decorators.

**The problem with `useDefineForClassFields: true` (default for ES2022+ targets):**

When set to `true`, TypeScript uses `Object.defineProperty()` semantics for class fields. The `defineProperty` call runs **after** the constructor, which means it runs **after** decorators have already set property values. The result: `defineProperty` overwrites the decorator-injected value with `undefined`.

```typescript
class UserController extends BaseController {
  @inject({ key: 'services.UserService' })
  private userService: UserService;  // Declared but not assigned

  handleRequest() {
    this.userService.findAll();  // TypeError: Cannot read property 'findAll' of undefined
  }
}
```

**What happens at runtime with `useDefineForClassFields: true`:**

```javascript
// Step 1: Decorator runs, sets this.userService = <resolved UserService instance>
// Step 2: Object.defineProperty(this, 'userService', { value: undefined, ... })
// Result: userService is undefined, decorator's work is lost
```

**What happens at runtime with `useDefineForClassFields: false`:**

```javascript
// Step 1: Decorator runs, sets this.userService = <resolved UserService instance>
// Step 2: this.userService = value (assignment semantics, in constructor body)
// Result: userService retains the decorator-injected value
```

**Related flag:** `strictPropertyInitialization` is also set to `false` because DI-injected properties are initialized by the container, not in the constructor body, and would otherwise trigger errors like:

```
error TS2564: Property 'userService' has no initializer and is not definitely
assigned in the constructor.
```

---

## Consumption Pattern

Every package in the Ignis monorepo follows an identical pattern to consume these configs. Here is the complete setup for a new package:

### 1. ESLint (`eslint.config.mjs`)

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

### 2. Prettier (`.prettierrc.mjs`)

```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

### 3. TypeScript (`tsconfig.json`)

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

Packages that need path aliases or additional settings simply add them under `compilerOptions`:

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

---

## Real-World Consumer Examples

The following are actual configurations from packages in the Ignis monorepo.

### packages/inversion (Standard Package)

The simplest and most common pattern -- direct consumption with path aliases:

**`eslint.config.mjs`:**

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

**`.prettierrc.mjs`:**

```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

**`tsconfig.json`:**

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist/cjs",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src", "./*.config.*", ".prettierrc.*"],
  "exclude": ["node_modules", "dist", "app_data"]
}
```

Note that `include` adds `./*.config.*` and `.prettierrc.*` so ESLint and Prettier config files are also type-checked.

---

### packages/core (Extended TypeScript Config)

The core package needs JSX support for Hono's JSX rendering, so it uses a two-level tsconfig chain:

**`tsconfig.core.json`** (base for core):

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src", "./*.config.*", ".prettierrc.*"],
  "exclude": ["node_modules", "dist", "app_data"]
}
```

**`tsconfig.json`** (adds JSX on top):

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "./tsconfig.core.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  }
}
```

This pattern demonstrates that you can chain `extends` references: `tsconfig.json` extends `tsconfig.core.json` which extends `@venizia/dev-configs/tsconfig.common.json`.

---

### examples/vert (Application-Level Config)

Applications use the same pattern as library packages:

**`tsconfig.json`:**

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src", "./*.config.*", ".prettierrc.*"],
  "exclude": ["node_modules", "dist", "app_data"]
}
```

---

## Setting Up a New Package

Complete step-by-step guide for adding a new package to the Ignis monorepo (or any project consuming `@venizia/dev-configs`).

### Step 1: Create the Package Directory

```bash
mkdir -p packages/my-package/src
```

### Step 2: Create `package.json`

```json
{
  "name": "@venizia/ignis-my-package",
  "version": "0.0.1",
  "description": "My new Ignis package",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "rebuild": "bun run clean && bun run build",
    "clean": "rm -rf dist *.tsbuildinfo",
    "eslint": "eslint --report-unused-disable-directives .",
    "lint": "bun run eslint && bun run prettier:cli",
    "lint:fix": "bun run eslint --fix && bun run prettier:fix",
    "prettier:cli": "prettier \"**/*.{js,ts}\" -l",
    "prettier:fix": "bun run prettier:cli --write"
  },
  "devDependencies": {
    "@venizia/dev-configs": "workspace:*",
    "eslint": "^9.36.0",
    "prettier": "^3.6.2",
    "typescript": "^5.9.3"
  }
}
```

### Step 3: Create `eslint.config.mjs`

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

### Step 4: Create `.prettierrc.mjs`

```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

### Step 5: Create `tsconfig.json`

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src", "./*.config.*", ".prettierrc.*"],
  "exclude": ["node_modules", "dist", "app_data"]
}
```

### Step 6: Create the Entry Point

```typescript
// src/index.ts
export const hello = 'world';
```

### Step 7: Install Dependencies and Verify

```bash
# From the monorepo root
bun install

# Verify TypeScript compiles
cd packages/my-package
tsc --noEmit

# Verify ESLint runs
bun run eslint

# Verify Prettier checks
bun run prettier:cli
```

---

## Extending and Overriding

### ESLint

Spread the base configs and append your overrides:

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default [
  ...eslintConfigs,
  {
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
```

### Prettier

Spread the base config object:

```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default {
  ...prettierConfigs,
  printWidth: 120,
};
```

### TypeScript

Use `"extends"` and override specific `compilerOptions`:

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  }
}
```

**Warning:** Do not override `experimentalDecorators`, `emitDecoratorMetadata`, or `useDefineForClassFields` unless you fully understand the consequences for the DI system. See [Critical Flags](#critical-flags-for-decorator-based-di).

---

## IDE Integration

### Visual Studio Code

Install these extensions for full integration:

1. **ESLint** (`dbaeumer.vscode-eslint`) -- Lint on save, show inline errors.
2. **Prettier** (`esbenp.prettier-vscode`) -- Format on save.

Recommended `.vscode/settings.json` for the monorepo:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.useFlatConfig": true,
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

Key points:

- **`eslint.useFlatConfig: true`** -- Tells the ESLint extension to use the flat config format. Without this, the extension may look for `.eslintrc` files instead of `eslint.config.mjs`.
- **`typescript.tsdk`** -- Points to the workspace's TypeScript version instead of the VS Code bundled one. Ensures the same TypeScript version is used for type checking in the IDE and during builds.
- Prettier handles formatting; ESLint handles code quality rules. The `eslint-plugin-prettier` integration in the config stack ensures they do not conflict.

---

### WebStorm / IntelliJ IDEA

WebStorm automatically detects `eslint.config.mjs` and `.prettierrc.mjs` files. Ensure these settings are enabled:

1. **Settings > Languages & Frameworks > JavaScript > Code Quality Tools > ESLint**: Select "Automatic ESLint configuration."
2. **Settings > Languages & Frameworks > JavaScript > Prettier**: Check "On save" and "On 'Reformat Code' action."
3. **Settings > Languages & Frameworks > TypeScript**: Point the TypeScript service to `node_modules/typescript/lib`.

---

## CI/CD Integration

### Lint Check in CI

Add a lint step to your CI pipeline. Example using GitHub Actions:

```yaml
name: Lint
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run lint          # Runs ESLint + Prettier check across all packages
```

### Per-Package Lint

If you need to lint a specific package:

```bash
# From the monorepo root
cd packages/core && bun run lint

# Or using make targets
make lint         # All packages
make lint-all     # All packages + examples
```

### Type Check in CI

```yaml
- run: make build    # tsc compilation validates types as a side effect
```

Since `noEmitOnError: true` is set, a failed type check will cause the build to fail.

---

## Troubleshooting

### ESLint flat config not recognized

**Symptom:** ESLint ignores `eslint.config.mjs` and reports "no configuration found."

**Cause:** ESLint version is below v9.0.0, which does not support flat config as the default format.

**Fix:**

```bash
bun add -d eslint@^9.0.0
```

Verify your version:

```bash
bun eslint --version   # Should be 9.x.x or later
```

---

### Prettier conflicts with ESLint

**Symptom:** ESLint and Prettier disagree on formatting, causing one to undo the other's changes.

**Cause:** Usually happens when ESLint formatting rules are not disabled by `eslint-plugin-prettier`.

**Fix:** The `@venizia/dev-configs` ESLint config already includes `eslint-plugin-prettier/recommended` (via the `@minimaltech/eslint-common` base layer), which automatically disables ESLint rules that conflict with Prettier. If you see conflicts, check that you are not adding formatting rules in your project-level overrides that conflict with Prettier settings.

---

### TypeScript decorator errors

**Symptom:**

```
error TS1219: Experimental support for decorators is a feature that is subject
to change in a future release.
```

**Cause:** `experimentalDecorators` is not enabled, usually because `tsconfig.json` does not extend the shared config or the `extends` path is wrong.

**Fix:** Verify your `tsconfig.json`:

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json"
}
```

If the path cannot be resolved, ensure `@venizia/dev-configs` is installed:

```bash
bun add -d @venizia/dev-configs
```

---

### DI injection returns undefined at runtime

**Symptom:** `@inject`-decorated properties are `undefined` at runtime even though the binding exists in the container.

**Cause:** Usually one of:

1. `emitDecoratorMetadata: false` -- the container cannot read constructor parameter types.
2. `useDefineForClassFields: true` -- `Object.defineProperty` overwrites decorator-injected values.

**Fix:** Verify both flags are set correctly in your `tsconfig.json`. If you extend `@venizia/dev-configs/tsconfig.common.json`, these are already set. Do not override them.

---

### Path alias resolution fails at runtime (tsc-alias)

**Symptom:** TypeScript compiles successfully, but runtime `import` statements fail with `MODULE_NOT_FOUND` for aliased paths like `@/services/UserService`.

**Cause:** TypeScript's `paths` configuration only affects type checking, not the emitted JavaScript. The compiled `.js` files still contain `@/...` import paths, which Node.js/Bun cannot resolve.

**Fix:** Use `tsc-alias` as a post-compilation step to rewrite path aliases in emitted JavaScript:

```bash
bun add -d tsc-alias
```

```json
{
  "scripts": {
    "build": "tsc && tsc-alias"
  }
}
```

---

### Module resolution errors (node16 vs nodenext)

**Symptom:**

```
error TS2835: Relative import paths need explicit file extensions in ECMAScript
imports when '--moduleResolution' is 'node16' or 'nodenext'.
```

**Cause:** With `moduleResolution: nodenext`, TypeScript enforces Node.js ESM resolution rules, which require explicit file extensions on relative imports.

**Fix:** Add `.js` extensions to relative imports (even though the source files are `.ts`):

```typescript
// CORRECT
import { UserService } from './services/user.service.js';

// INCORRECT (will error with nodenext resolution)
import { UserService } from './services/user.service';
```

This is a TypeScript convention: you write `.js` in the import path because the compiled output will be `.js` files.

---

### Incremental build stale cache

**Symptom:** TypeScript does not pick up changes, or emits stale output after modifying files.

**Cause:** The `.tsbuildinfo` incremental cache file is corrupted or stale.

**Fix:** Delete the `.tsbuildinfo` file and rebuild:

```bash
rm -f *.tsbuildinfo
tsc
```

Or use the clean script:

```bash
bun run clean && bun run build
```

---

## Version Compatibility

| Tool | Required Version | Notes |
| :--- | :--------------- | :---- |
| **ESLint** | `^9.0.0` | Flat config format. Versions below 9.0 do not support `eslint.config.mjs` as the default config file. |
| **Prettier** | `^3.0.0` | Major version 3 for `trailingComma: "all"` support in type parameters. |
| **TypeScript** | `^5.0.0` | Required for `@typescript-eslint` v8 compatibility and modern decorator metadata support. |
| **Bun** | `>=1.3` | Primary runtime. Specified in `package.json` `engines` field. |
| **Node.js** | `>=18.0` | Secondary runtime. ES2022 target requires Node.js 18+ for full API support. |
| **@typescript-eslint** | `^8.44.0` | Provided transitively via `@minimaltech/eslint-node`. |
| **eslint-plugin-unicorn** | `^62.0.0` | Direct dependency of `@venizia/dev-configs`. |
| **eslint-plugin-n** | `^17.21.3` | Provided transitively via `@minimaltech/eslint-node`. |

---

## Comparison with Alternatives

### Why a shared config package instead of per-package configs?

| Approach | Pros | Cons |
| :------- | :--- | :--- |
| **Shared package (what we do)** | Single source of truth; update once, propagate everywhere; guaranteed consistency; 3-line consumption | Requires publishing/building the package before consumers can use it; tighter coupling |
| **Copy-paste configs** | Independent per package; no build dependency | Config drift across packages; painful to update 10+ packages; no guarantee of consistency |
| **Root-level configs only** | Zero duplication | Does not work for published packages that need their own `tsconfig.json` for declaration emit; monorepo tools may not respect root configs |
| **Tool-specific workspace configs** (e.g., ESLint `root: true`) | Built into the tool | Only works for ESLint (legacy format); Prettier and TypeScript have no equivalent workspace inheritance |

---

### Why flat config (ESLint v9+) instead of `.eslintrc`?

- **Explicit composition:** Config is a plain array of objects. No magic resolution, no `extends` chains, no cascading from parent directories.
- **Type safety:** The `Linter.Config[]` type provides autocomplete and type checking.
- **Plugin loading:** Plugins are imported as ES modules, not resolved by string name. No more version mismatch confusion.
- **Future-proof:** ESLint has deprecated `.eslintrc` as of v9. It will be removed in a future major version.

---

### Why Prettier config in `.prettierrc.mjs` instead of `.prettierrc.json`?

- **Import support:** `.mjs` files can `import` from npm packages. `.json` files cannot reference external configs.
- **Spread operator:** JavaScript allows `{ ...baseConfig, override: value }`. JSON does not support any form of inheritance.
- **Consistency:** All three configs (ESLint, Prettier, TypeScript) follow the same "import from shared package" pattern.

---

## Package Exports

| Export Path | Resolves To | Description |
| :---------- | :---------- | :---------- |
| `@venizia/dev-configs` | `dist/index.js` | ESLint and Prettier configs (`eslintConfigs`, `prettierConfigs`) |
| `@venizia/dev-configs/tsconfig.base.json` | `tsconfig/tsconfig.base.json` | Comprehensive base TypeScript config |
| `@venizia/dev-configs/tsconfig.common.json` | `tsconfig/tsconfig.common.json` | Consumer-facing TypeScript config (recommended) |
| `@venizia/dev-configs/package.json` | `package.json` | Package manifest |

---

## Important Notes

- **Monorepo-wide impact.** This package is the foundation of every other package in the Ignis monorepo. Any change to ESLint rules, Prettier settings, or TypeScript compiler options propagates to **all** packages and examples. Test thoroughly before modifying.

- **Decorator flags are non-negotiable.** The `experimentalDecorators`, `emitDecoratorMetadata`, and `useDefineForClassFields` settings are structural requirements of the Ignis DI system. Changing them will break `@inject`, `@controller`, `@repository`, and every other decorator in the framework.

- **ESLint v9+ required.** This package exports flat config arrays, not the legacy `.eslintrc` format. ESLint v9.0.0 or later is required.

- **Bun is the primary runtime.** The `engines` field specifies `bun >= 1.3`. While the configs themselves are runtime-agnostic, the monorepo build system uses Bun exclusively.

- **Build order matters.** `@venizia/dev-configs` is the root of the build dependency chain (`dev-configs -> inversion -> helpers -> boot -> core`). It must be built before any other package.

---

## License

[MIT](./LICENSE.md)

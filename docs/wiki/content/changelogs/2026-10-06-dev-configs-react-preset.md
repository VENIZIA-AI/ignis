---
title: dev-configs Gains a React Preset
description: "ReactEslintConfigs gives a React frontend the same lint base as its backend, plus React, hooks and accessibility rules. The base drops a duplicate rule and raises ban-ts-comment and no-namespace to error."
---

# Changelog - 2026-10-06

## A React frontend shares one lint source with its backend

<Badge type="tip" text="Feature" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `@venizia/dev-configs` exports `ReactEslintConfigs`: the base preset plus what a React frontend needs.

```js
// eslint.config.mjs
import { ReactEslintConfigs } from '@venizia/dev-configs';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default ReactEslintConfigs.create({ plugins: { react, reactHooks, jsxA11y } });
```

## What changed

Until now, dev-configs had no React rule. A frontend kept a second base preset or re-declared the same rules in every package, and the copies drifted.

`ReactEslintConfigs.create()` takes the plugins as options, so a backend that never calls it installs nothing new. `reactVersion` defaults to `'detect'`; under ESLint 10, pass it (`'19.2'`), since eslint-plugin-react 7 cannot detect it there. On top of `eslintConfigs` it adds:

| Adds | Setting |
|---|---|
| React correctness - `jsx-key`, `no-children-prop`, `no-deprecated` and 11 more | `error`, `.jsx`/`.tsx` |
| `jsx-a11y` basics - `alt-text`, `aria-props`, `aria-role` and 6 more | `error`, `.jsx`/`.tsx` |
| `react-hooks/rules-of-hooks` | `error`, `.js`/`.jsx`/`.ts`/`.tsx` - custom hooks live in `.ts` too |
| `react-hooks/exhaustive-deps` | `warn`, `.js`/`.jsx`/`.ts`/`.tsx` |
| `@typescript-eslint/consistent-type-imports` | `error`, `prefer: 'type-imports'` |
| `@typescript-eslint/no-explicit-any` | `warn` - the base has it `off` |

It relaxes what a UI does on purpose:

| Rule | Setting | Why |
|---|---|---|
| `naming-convention` | the base rule plus PascalCase functions, `.jsx`/`.tsx` | `function App()` is a component |
| `no-floating-promises`, `no-void` | `off` | Event handlers and effects fire promises they do not await |
| `no-invalid-this`, `no-use-before-define` | `off` | Function components; a component may be used above its declaration |
| `no-shadow` | `warn` | |
| `no-unused-vars` | `warn`, `_`-prefixed names ignored | |

Rules the automatic JSX runtime or `tsc` already enforce - `react-in-jsx-scope`, `prop-types`, `jsx-no-undef`, `jsx-no-duplicate-props`, `no-unknown-property` - are left out.

**The base, for every consumer.**

| Rule | Before | Now |
|---|---|---|
| `@typescript-eslint/ban-ts-comment` | `off` | `error`. `@ts-expect-error` with a description is still allowed |
| `@typescript-eslint/no-namespace` | `off` | `error` |
| `curly` | declared twice | declared once, by the upstream preset; same value |

## Who is affected

- **A React frontend.** Replace a second base preset, or per-package React rules, with `ReactEslintConfigs.create()`. Keep only your house rules on top.
- **Code with `@ts-ignore`, `@ts-nocheck`, or a bare `@ts-expect-error`.** It now fails lint. Use `@ts-expect-error` with a reason.
- **Code with a `namespace`.** It now fails lint. Use modules.

**Files:** [`packages/dev-configs/src/react.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs/src/react.ts), [`packages/dev-configs/src/eslint.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs/src/eslint.ts)

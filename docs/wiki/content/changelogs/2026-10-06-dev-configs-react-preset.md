---
title: dev-configs Gains a React Preset
description: "ReactEslintConfigs gives a React frontend the same lint base as its backend, plus React, hooks and accessibility rules; the base raises ban-ts-comment and no-namespace to error."
packages: ['@venizia/dev-configs']
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

- **Plugins are options.** `ReactEslintConfigs.create()` takes them, so a backend that never calls it installs nothing new. `reactVersion` defaults to `'detect'`; under ESLint 10, pass it (`'19.2'`), since eslint-plugin-react 7 cannot detect it there.
- **Added on top of `eslintConfigs`:** React correctness rules (`jsx-key`, `no-children-prop`, `no-deprecated` and 11 more) and `jsx-a11y` basics (`alt-text`, `aria-props`, `aria-role` and 6 more) as `error` on `.jsx`/`.tsx`; `react-hooks/rules-of-hooks` as `error` and `react-hooks/exhaustive-deps` as `warn` on `.js`, `.jsx`, `.ts` and `.tsx`; `@typescript-eslint/consistent-type-imports` as `error` (`prefer: 'type-imports'`); `@typescript-eslint/no-explicit-any` as `warn`.
- **Relaxed on purpose for a UI:** `naming-convention` allows PascalCase functions in `.jsx`/`.tsx`; `no-floating-promises`, `no-void`, `no-invalid-this` and `no-use-before-define` are `off`; `no-shadow` and `no-unused-vars` are `warn` (`_`-prefixed names ignored).
- **The base, for every consumer:** `@typescript-eslint/ban-ts-comment` goes from `off` to `error` (`@ts-expect-error` with a description is still allowed), and `@typescript-eslint/no-namespace` goes from `off` to `error`.

## Who is affected

- **A React frontend.** Replace a second base preset, or per-package React rules, with `ReactEslintConfigs.create()`. Keep only your house rules on top.
- **Code with `@ts-ignore`, `@ts-nocheck`, or a bare `@ts-expect-error`.** It now fails lint. Use `@ts-expect-error` with a reason.
- **Code with a `namespace`.** It now fails lint. Use modules.

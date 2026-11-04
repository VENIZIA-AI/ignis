---
title: The shared ESLint presets require blank-line padding
description: "houseConfigs, reactHouseConfigs and eslintConfigs add four blank-line rules, fixed by devz lint --fix. ESLint only."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-11-04

## The shared ESLint presets require blank-line padding

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `houseConfigs`, `reactHouseConfigs` and `eslintConfigs` now report missing blank lines after imports, before a `return`, between class members and around block-like statements. `devz lint --fix` writes them.

## What changed

- **Four rules, two ESLint entries.** A blank line after the import block (none needed between two imports). A blank line before a `return` that follows other statements. A blank line between class members, except after a one-line member. A blank line after every block-like statement when another statement follows, and before one that follows other statements.
- **Block-like** means `if`, `for`, `while`, `do`, `switch`, `try`, a bare block, and a declaration whose value ends in a block, such as `const f = () => { ... }`. An `else` or `catch` chain is one statement and is not split.
- **Case clauses.** Between `case` and `default` clauses the padding is left as written, so stacked labels stay together and `no-fallthrough` stays quiet.
- **`paddingConfigs`** is a new export of `@venizia/dev-configs/linters`. It carries the plugin and the rules, not a parser; it rides on the TypeScript parser of `namingConventionConfigs` or `eslintConfigs`.
- **New dependency.** `@venizia/dev-configs` depends on `@stylistic/eslint-plugin`. The deprecated ESLint core versions of these rules are not used.
- **ESLint only.** oxlint 1.89 has none of these rules. A project that lints with oxlint alone gets no padding check until oxlint adds them.

## Who is affected

- **Projects that use `houseConfigs`, `reactHouseConfigs` or `eslintConfigs`.** Lint reports the missing blank lines as errors. Run `devz lint --fix` once; it only adds blank lines.
- **Projects that lint with oxlint alone.** No action needed. Nothing changes.
- **A project that does not want a rule.** Set it to `'off'` after the preset.

## Details

The exact configuration:

```typescript
{
  '@stylistic/padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: 'import', next: '*' },
    { blankLine: 'any', prev: 'import', next: 'import' },
    { blankLine: 'always', prev: '*', next: 'return' },
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: '*', next: 'block-like' },
    { blankLine: 'any', prev: ['case', 'default'], next: ['case', 'default'] },
  ],
  '@stylistic/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
}
```

The entries are read in order and the last match wins, so the `import` pair follows "after an import" and the `case` entry follows the block-like ones.

```typescript
// before
let fieldEnd = 0;
while (fieldEnd < length) {
  fieldEnd++;
}
return fieldEnd;

// after
let fieldEnd = 0;

while (fieldEnd < length) {
  fieldEnd++;
}

return fieldEnd;
```

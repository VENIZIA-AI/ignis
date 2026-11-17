---
title: A new lint rule against calling a method on a new instance inside an await
description: "venizia/no-await-new-chain is in houseConfigs and reactHouseConfigs at error. await new Runner().run() becomes a declared instance and an await on the next line, and the rule fixes it."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-11-08

## A new lint rule against calling a method on a new instance inside an await

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `houseConfigs` and `reactHouseConfigs` now include `venizia/no-await-new-chain` at `error`: declare the instance first, then await on its own line.

## What changed

- **The rule.** `await new Runner(options).run()` and `const text = await new Response(body).text()` are reported. Declare the instance, then await: `const runner = new Runner(options); await runner.run();`.
- **Builder chains.** `await new SignJWT(claims).setIssuer(issuer).sign(key)` is reported. Declare the builder up to its last call, then await that call.
- **What stays allowed.** `await new Promise(...)` (no method is called on the instance), `await new X().prop` (not a call), and an instance that is already declared.
- **A fixer.** `eslint --fix` and `devz codemod async-style` declare the instance in a `const` named after the class, when the `await` is the whole statement or the whole initializer of a declaration, or nothing that does more than read a value runs before it. Other findings are reported and left for you.
- **It runs in test files too**, like the other async rules.

## Who is affected

- **A project that uses `houseConfigs` or `reactHouseConfigs`.** The next lint run reports each `await new X(...).method(...)`. Run `devz codemod async-style` to fix them, or `eslint --fix`.
- **Everyone else.** No action needed.

## Details

```typescript
// Before: reported
const text = await new Response(body).text();

// After: the fix
const response = new Response(body);
const text = await response.text();
```

| File | Package |
|------|---------|
| `src/linters/house/no-await-new-chain.rule.ts` | dev-configs |
| `src/linters/house/plugin.ts` | dev-configs |
| `src/linters/house/async-rules.ts` | dev-configs |
| `src/cli/codemod/async-style.ts` | dev-configs |

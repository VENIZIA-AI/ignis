---
title: dev-configs drops eslint-plugin-n and eslint-plugin-unicorn
description: "@venizia/dev-configs no longer installs eslint-plugin-n and eslint-plugin-unicorn, which served two rules; the dependency tree falls from 112 to 34 packages and from 23.5 MB to 7.0 MB. The oxlint preset still runs both, and the ESLint preset keeps the switch-case braces rule as a house rule."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-11-04

## dev-configs drops eslint-plugin-n and eslint-plugin-unicorn

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** Installing `@venizia/dev-configs` pulls in 78 fewer packages (23.5 MB down to 7.0 MB), because two ESLint plugins that served one rule each are gone.

## What changed

- **`eslint-plugin-n` and `eslint-plugin-unicorn` are no longer dependencies.** They ran `n/prefer-node-protocol` and `unicorn/switch-case-braces` in the legacy `eslintConfigs` preset, and nothing else.
- **`oxlintConfigs` is unchanged.** It runs `unicorn/prefer-node-protocol` and `unicorn/switch-case-braces` itself, so a project that lints with oxlint reports the same findings as before.
- **The braces rule stays in every preset.** `eslintConfigs` runs the switch-case check as `venizia/no-unbraced-case` (a `case` or `default` with statements takes a block; the fix adds it), `oxlintConfigs` as `unicorn/switch-case-braces`, and both keep `curly: 'all'` for `if`, `for` and `while` bodies. A test pins all of it in each preset.
- **`eslintConfigs` no longer checks the `node:` prefix.** That was `n/prefer-node-protocol`; `oxlintConfigs` still runs `unicorn/prefer-node-protocol`.

## Who is affected

- **Projects on `oxlintConfigs`** (this repository and the usual setup): no action needed.
- **Projects that lint with `eslintConfigs` alone:** the `node:` prefix check is gone from ESLint; run oxlint for it.
- **Projects that name `n/prefer-node-protocol` or `unicorn/switch-case-braces` in their own ESLint config:** see Breaking changes.

## Breaking changes

> [!WARNING]
> ESLint stops with a "Could not find plugin" error for a config that still names `n/prefer-node-protocol` or `unicorn/switch-case-braces`.

**Migration.** Rename `unicorn/switch-case-braces` to `venizia/no-unbraced-case` (`eslintConfigs` already enables it) and delete `n/prefer-node-protocol`; oxlint with `oxlintConfigs` covers the `node:` prefix. A project that must check it in ESLint adds `eslint-plugin-n` to its own dependencies and registers the plugin itself.

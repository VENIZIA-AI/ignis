---
title: dev-configs drops eslint-plugin-n and eslint-plugin-unicorn
description: "@venizia/dev-configs no longer installs eslint-plugin-n and eslint-plugin-unicorn, which served two rules; the dependency tree falls from 112 to 34 packages and from 23.5 MB to 7.0 MB. The oxlint preset still runs both rules."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-11-04

## dev-configs drops eslint-plugin-n and eslint-plugin-unicorn

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** Installing `@venizia/dev-configs` pulls in 78 fewer packages (23.5 MB down to 7.0 MB), because two ESLint plugins that served one rule each are gone.

## What changed

- **`eslint-plugin-n` and `eslint-plugin-unicorn` are no longer dependencies.** They ran `n/prefer-node-protocol` and `unicorn/switch-case-braces` in the legacy `eslintConfigs` preset, and nothing else.
- **`oxlintConfigs` is unchanged.** It runs `unicorn/prefer-node-protocol` and `unicorn/switch-case-braces` itself, so a project that lints with oxlint reports the same findings as before.
- **`eslintConfigs` no longer reports those two rules.** It carries no `n` or `unicorn` plugin now.

## Who is affected

- **Projects on `oxlintConfigs`** (this repository and the usual setup): no action needed.
- **Projects that lint with `eslintConfigs` alone, or name `n/prefer-node-protocol` or `unicorn/switch-case-braces` in their own ESLint config:** see Breaking changes.

## Breaking changes

> [!WARNING]
> ESLint stops with a "Could not find plugin" error for a config that still names `n/prefer-node-protocol` or `unicorn/switch-case-braces`.

**Migration.** Delete those two rule names from your ESLint config and run oxlint with `oxlintConfigs` for them; a project that must check them in ESLint adds `eslint-plugin-n` or `eslint-plugin-unicorn` to its own dependencies and registers the plugin itself.

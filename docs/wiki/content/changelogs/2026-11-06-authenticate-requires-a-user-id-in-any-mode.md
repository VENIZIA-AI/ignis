---
title: The authenticate middleware requires a user id in the default any mode
description: "A strategy that answers without a userId no longer authenticates a request in any mode, as it already did not in all mode. The next strategy gets its turn."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-06

## The authenticate middleware requires a user id in the default any mode

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `authenticate({ strategies })` in the default `any` mode now requires the strategy's answer to carry a `userId`, as `all` mode already did. A verified credential that does not identify a user no longer authenticates the request.

## What changed

- **One rule for both modes.** In `any` mode a strategy whose answer has no `userId` counts as failed; the next strategy is tried, and when none identifies a user the request is refused with `401`. `all` mode is unchanged.
- **Why it matters.** A token can verify without being a login token, for example one the same signing key issued for another purpose. Such a token, when it carries no `userId`, no longer becomes the current user. A token that does carry one is still accepted if the signature and time claims verify; restricting the accepted purpose, audience and issuer is a `verify` option of the strategy.
- **Tests.** The provider is tested in both modes with a user, without a user id, with an empty id, and with several strategies.

## Who is affected

- **Apps whose strategies return a user without `userId`.** They now get `401`; return the id in the strategy's answer. The built-in strategies already do.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A request that was authenticated with a credential whose strategy answered without a `userId` is refused with `401` in `any` mode.

## Details

| File | Package |
|------|---------|
| `src/base/auth/authenticate/providers/authentication.provider.ts` | kernel |

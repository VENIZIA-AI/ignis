---
title: After 0.4.6 - What Changed and How to Upgrade
description: "Every user-facing change since 0.4.6 in one table, with an ordered upgrade checklist. IGNIS moves public functions into classes, replaces the logger types, makes AES and RSA async, and puts Hash on Bun."
packages:
  [
    '@venizia/dev-configs',
    '@venizia/ignis-inversion',
    '@venizia/ignis-filter',
    '@venizia/ignis-helpers',
    '@venizia/ignis-boot',
    '@venizia/ignis-kernel',
    '@venizia/ignis-connectors',
    '@venizia/ignis-worker',
    '@venizia/ignis',
  ]
---

# Changelog - 2026-11-02

## After 0.4.6: what changed and how to upgrade

<Badge type="warning" text="Breaking Change" /> <Badge type="warning" text="Behavior Change" /> <Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" />

**In one line.** This round removes the old standalone function names (one codemod moves your calls), removes the old logger types, makes AES, LegacyAES and RSA async, and puts Hash and the commit token on Bun. Update the packages together and follow the checklist in order.

## What changed

Each row links the entry with the details.

| Group | Change | Entry |
|---|---|---|
| Breaking | 184 public functions moved into classes and their old names are removed, with no aliases. 39 of them took positional arguments and now take one options object. Error and log message tags that carried a function name now carry the class and method. `devz codemod namespace-functions` rewrites your calls | [The old function names are removed](/changelogs/2026-11-01-the-old-function-names-are-removed) |
| Breaking | `ApplicationLogger`, `LoggerSlot`, `LoggerResolver`, `TLoggerResolver`, `ResolvedLogger` and `SHOULD_LOG_DEBUG` are removed. `LoggerFactory.getLogger([scope])` and `LoggerFactory.use({ provider, level })` replace them, and `ConsoleLogger.get` takes the scope as a string | [LoggerFactory in core](/changelogs/2026-11-01-logger-factory-in-core) |
| Breaking | MinIO support, `StaticAssetStorageTypes.MINIO` and `readAffectedRowCount` are removed | [The old function names are removed (Manual steps)](/changelogs/2026-11-01-the-old-function-names-are-removed) |
| Breaking | `AES`, `LegacyAES` and `RSA` return promises and run over Web Crypto; input checks are stricter | [AES and RSA run over Web Crypto](/changelogs/2026-11-02-aes-and-rsa-run-over-web-crypto) |
| Breaking | `isMailTransport` and `isValidMailOptions` are `MailTypeUtility.isTransport` and `MailTypeUtility.isValidOptions` | [Mail type guards](/changelogs/2026-11-02-mail-type-guards) |
| Behavior change | `Hash.digest`, `Hash.hmac` and `AssetCommitToken` need Bun; the mail generators name a bad length or size | [Hash and commit token need Bun](/changelogs/2026-11-02-hash-and-commit-token-need-bun) |
| Behavior change | `CredentialHelper.hash` writes argon2id by default; `algorithm: 'bcrypt'` keeps bcrypt | [CredentialHelper argon2id default](/changelogs/2026-11-02-credential-helper-argon2id-default) and [the class itself](/changelogs/2026-11-01-credential-helper) |
| Behavior change | The console is the default logger and `@venizia/ignis` selects Winston at `initialize()` when nothing was chosen; debug is decided by a gate read on every line; a Winston that is installed but cannot load prints one warning | [LoggerFactory in core](/changelogs/2026-11-01-logger-factory-in-core) |
| Behavior change | `devz codemod async-style`, `const-classes` and `drop-redundant-casts` refuse `--write` without a path or `--all`; the `async-style` and `namespace-functions` codemods refuse a file with local changes | [Codemod write needs a path](/changelogs/2026-11-02-codemod-write-needs-a-path) |
| Fix | The Vite plugin runs under Node again; the artifact scan cache uses a pure hash, so the first build after the update misses the cache once | [Vite plugin runs under Node again](/changelogs/2026-11-02-vite-plugin-runs-under-node-again) |
| Feature | `ECDH` can be imported from `@venizia/ignis-helpers/core`, so a browser and a server share one class | [ECDH in the browser](/changelogs/2026-11-02-ecdh-in-the-browser) |
| Feature | `Hash` takes bytes and several parts | [Hash takes bytes and parts](/changelogs/2026-11-01-hash-takes-bytes-and-parts) |
| Feature | `RecursiveTreeSql.walk` takes several roots or none, one filter for both terms, and `start: 'all'` | [Recursive tree roots and filter](/changelogs/2026-11-01-recursive-tree-roots-and-filter) and [Recursive tree start all](/changelogs/2026-11-01-recursive-tree-start-all) |
| Feature | Opt-in lint rules and a codemod for async style (`no-inline-await`, `no-return-await`, the hook rules), plus `no-await-promise-chain` and `no-silent-catch` | [Async style rules](/changelogs/2026-10-31-dev-configs-async-style-rules), [no-await-promise-chain](/changelogs/2026-10-31-dev-configs-no-await-promise-chain), [Async style hoisted names](/changelogs/2026-10-31-dev-configs-async-style-hoisted-names) |
| Feature | A `shared` kind in the IGNIS preset; the release plan re-releases `@venizia/ignis` when a tool of its preset changes; the app preset's `boot.test.ts` and `hello.controller.ts` now use the class forms (`ApplicationBootAssertion.assert({ application })`, `OpenApiResponses.jsonContent`) and the `lib` preset summary text changed | [Shared preset kind](/changelogs/2026-10-31-shared-preset-kind) and [Release plan includes the preset catalog](/changelogs/2026-11-02-release-plan-includes-the-preset-catalog) |

## Upgrade checklist

Do these in order.

1. **Update every `@venizia/*` package together.** IGNIS packages pin each other exactly, so a partial update leaves two copies of a package.
2. **Commit your work, then run `bunx devz codemod namespace-functions` (a dry run), then `bunx devz codemod namespace-functions --write <paths>`.** It refuses a file with local changes. It has no `--all`; with no path it walks the files git knows. It also moves `ApplicationLogger.get(...)` to `LoggerFactory.getLogger([...])`. It lists, and never rewrites, a spread argument, an old name used as a value, a re-export, a name collision and an `@/` alias it cannot follow.
3. **Fix by hand what the codemod listed and what the typecheck finds:** direct `ConsoleLogger.get({ scope })` calls (now `ConsoleLogger.get(scope)`), every `LoggerSlot.use({ resolver })` (now `LoggerFactory.use({ provider, level })`), MinIO uses (use `BunS3Helper` over the S3 API), `readAffectedRowCount`.
4. **Add `await` to calls of `AES`, `LegacyAES` and `RSA` methods.** Check your own subclasses of `BaseCryptoAlgorithm` and any override of `encryptPayload` or `decryptPayload` too. The typecheck does not catch every call: one inside a template string, on an `any` target, in a JavaScript file, or left floating in a `try` with no `await` can slip through.
5. **Search your tests, logs and alerts for the old message tags** (see the list in the old-function-names entry) and update what matches.
6. **Call `Hash` or build a commit token under Node, in a Vite config or in a browser?** Move that code to Bun, or use Web Crypto there.
7. **Run `bun check` and your gates, then decrypt a real stored value.** Stored data still reads, and a real value is the proof.
8. **Optional: adopt what is new.** Use `CredentialHelper` for passwords, `ECDH` from `/core` in a browser, and the async-style lint rules (`devz codemod async-style <path> --write`).
9. **Expect the first Vite build to miss the artifact scan cache once.**
10. **Copied `boot.test.ts` or `hello.controller.ts` from the app preset?** The codemod rewrites the calls in your copy; nothing else to do.

## Who is affected

- **Callers of old standalone function names and old logger types.** Steps 2-3.
- **Callers of `AES`, `LegacyAES` or `RSA`.** Step 4.
- **Callers of `Hash` or builders of a commit token under Node, in Vite or in a browser.** Step 6.
- **Everyone else.** Update the packages together and run the codemod.

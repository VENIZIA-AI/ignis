---
title: Storage log lines escape a caller's key
description: "A key, segment, bucket or file name chosen by the caller is quoted and escaped before a storage helper writes it to a log line, so it cannot forge a line or hide text. EchoUtility.toSafeEcho is the one place that does it."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-08

## Storage log lines escape a caller's key

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** A rejected key such as `a<line break>ERROR admin logged in` used to be written into the server log as it came in, so a caller could forge a second log line. It is now quoted, and every unsafe character is shown as an escape.

## What changed

- **Quoted and escaped.** The validation messages of `BaseStorageHelper` (`isValidSegment`, `isValidObjectKey`, `isValidBucketName` and the original-name check), the `Uploaded:` line, and the `DiskHelper` and `BunS3Helper` warnings now write a caller's value as one quoted token: `Path segment failed validation: "a\u202eb" (in path: "folder/a\u202eb")`. A normal key stays readable: `"photos/a.png"`.
- **What is escaped.** Line breaks and other control characters, escape sequences, the line and paragraph separators, bidirectional overrides and isolates, and zero-width and other invisible characters.
- **The zero-width space.** `isValidSegment` still accepts it in a name. It is escaped in the log, so it can no longer hide in a line.
- **New: `EchoUtility`.** From `@venizia/ignis-helpers` and `@venizia/ignis-helpers/core`. `toSafeEcho({ value })` returns the quoted, escaped text for a caller value in your own log line; hand it to a `%s`. `toSafeText({ value })` escapes without quoting, for a value inside a message.

## Who is affected

- **Anyone who reads or alerts on these log lines.** A segment or key now has double quotes around it, and an unsafe character is a `\uXXXX` escape. Update a pattern that matched the bare value.
- **Everyone else.** No action needed.

## Details

- **Thrown messages.** The message of an error a helper throws (`Invalid object name | key: ...`, `Object not found | bucket: ... | key: ...`) holds the caller's key too, and the error handler writes it to the log as it is. It gets the same escaping through `EchoUtility.toSafeText({ value })`, without the quotes: an ordinary name reads exactly as before, and only an unsafe character changes.
- **A system error in the disk helper's log.** Its text quotes the path, so the helper writes it as one escaped line.

| File | Package |
|------|---------|
| `src/utilities/echo.utility.ts` | helpers |
| `src/modules/storage/base.ts` | helpers |
| `src/modules/storage/disk/helper.ts` | helpers |
| `src/modules/storage/bun-s3/helper.ts` | helpers |

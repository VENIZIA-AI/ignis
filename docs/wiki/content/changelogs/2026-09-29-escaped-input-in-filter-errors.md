---
title: Filter and Update Errors Quote the Rejected Key on One Line
description: "Error messages that quote a key, field or order entry from the request now escape control characters and Unicode line terminators, so a crafted key can no longer split a log line."
---

# Changelog - 2026-09-29

## Rejected keys are escaped in error messages

<Badge type="info" text="Bug Fix" />

**In one line.** An error that quotes a key, field or order entry a request sent now writes every unsafe character as an escape, so the message stays on one line.

## What changed

A key such as `na\nme` used to print a real newline inside the message, so a caller could split a log line or send terminal control sequences. Now these characters come out as `\uXXXX` escapes:

- C0 control characters (`\u0000`-`\u001f`), including newline, carriage return, ESC and NUL;
- DEL (`\u007f`) and the C1 range (`\u0080`-`\u009f`);
- the Unicode line and paragraph separators (` `, ` `).

| Message | Where |
|---|---|
| `Column NOT FOUND \| key: '...'` | relational `toWhere`, `toOrderBy`, JSON-path columns, and updates |
| `Invalid JSON path component: '...'` | relational JSON-path keys |
| `Field NOT FOUND \| field: '...'` | Typesense and Meilisearch |
| `[parseOrderEntry] ... \| entry: "..."` | every dialect's order parser |

## Who is affected

- **Anyone who reads these messages in logs.** A crafted key can no longer forge a log line.
- **A test that asserts one of these messages for a key with a control character.** It now sees the escape instead of the raw character. Messages for ordinary keys are unchanged.

## Migration

None.

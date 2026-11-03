---
title: Filter and Update Errors Quote the Rejected Key on One Line
description: "Error messages that quote a key, field or order entry from the request now escape control characters and Unicode line terminators, so a crafted key can no longer split a log line."
packages: ['@venizia/ignis-connectors', '@venizia/ignis-filter']
---

# Changelog - 2026-09-29

## Rejected keys are escaped in error messages

<Badge type="info" text="Bug Fix" />

**In one line.** A crafted key can no longer forge a log line: errors that quote a key, field or order entry a request sent now write every unsafe character as a `\uXXXX` escape.

## What changed

A key such as `na\nme` used to print a real newline inside the message, so a caller could split a log line or send terminal control sequences. These characters are now escaped:

- C0 control characters (`\u0000`-`\u001f`), including newline, carriage return, ESC and NUL;
- DEL (`\u007f`) and the C1 range (`\u0080`-`\u009f`);
- the Unicode line and paragraph separators.

The messages covered:

- `Column NOT FOUND | key: '...'` (relational `toWhere`, `toOrderBy`, JSON-path columns, and updates)
- `Invalid JSON path component: '...'`
- `Field NOT FOUND | field: '...'` (Typesense and Meilisearch)
- `[parseOrderEntry] ... | entry: "..."` (every dialect's order parser)

## Who is affected

- **Anyone who reads these messages in logs.** No action needed.
- **A test that asserts one of these messages for a key with a control character.** It now sees the escape. Messages for ordinary keys are unchanged.

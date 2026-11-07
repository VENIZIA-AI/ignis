---
title: HttpDataSource keeps the request path under the base path
description: "buildUrl refuses a request path that holds a dot segment (also percent-encoded), a backslash or a control character, and checks that the resolved URL is on the base origin and under the base path."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-07

## HttpDataSource keeps the request path under the base path

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior change" />

**In one line.** A request path such as `['..', 'admin']` resolved above the configured `baseUrl` path on the same origin. It is a `400` validation error now.

## What changed

- **Dot segments.** A path segment that is `.` or `..`, written plain or percent-encoded (`%2e%2e`, `.%2e`, `%2E`), is refused. A `%2f`, a `?` or a `#` ends a segment for this check, and a trailing space is ignored, so `users%2f..%2fadmin`, `..?x`, `..#` and `.. ` are refused too.
- **Hidden forms.** A backslash (`\` or `%5c`) and any control character, including a tab or a newline inside the dots, are refused: the URL parser reads a backslash as a slash and drops the control characters.
- **Resolved URL.** After the URL is built it is checked once more: same origin as `baseUrl`, and a path equal to or under the base path.
- **Base URL.** A `baseUrl` with a `?` or `#` is refused by the constructor (500): the request paths would end up inside the query or the fragment. Use the call's `query` option.
- **Message.** The error names the path escaped on one line and cut at 200 characters, never the host or the query.
- **Unchanged.** Names such as `a.b`, `...`, `..hidden`, `v1.2`, a space (`a b`) and encoded text (`caf%C3%A9`) keep working. The query is not read as a path.

## Who is affected

- **Code that passed a dot segment in `paths`.** It was escaping the base path; build the path without it.
- **Ids that contain a backslash.** `findById`, `updateById` and `deleteById` encode the id, and `%5c` is refused: some servers decode it into a separator and read it as a slash. An id with a backslash answers a 400 now.
- **A `baseUrl` with a query or a fragment.** Move the query to the call's `query` option.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/http/datasource.ts` | connectors |

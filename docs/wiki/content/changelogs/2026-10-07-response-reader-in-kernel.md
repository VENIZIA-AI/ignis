---
title: HttpResponseReader Moves Next to the Server Contract
description: "HttpResponseReader is exported from @venizia/ignis-kernel/repository, so a client reads an IGNIS server's Content-Range and error envelope without taking the http connector. Connectors still re-exports it."
---

# Changelog - 2026-10-07

## HttpResponseReader moves next to the server contract

<Badge type="info" text="Enhancement" />

**In one line.** `HttpResponseReader` is exported from `@venizia/ignis-kernel/repository`, beside `buildDataRange`.

```typescript
import { HttpResponseReader } from '@venizia/ignis-kernel/repository';

const range = HttpResponseReader.parseContentRange({ header: response.headers.get('content-range') });
const envelope = HttpResponseReader.readErrorEnvelope({ body, rootKey: 'error' });
```

## What changed

A client that reads an IGNIS server without the http connector, such as a data provider, had two choices: take connectors as a dependency, or copy the parsing. The copy drifted; for example, a missing `Content-Range` became the page length as the total. The reader now lives with the server contract, in the browser-light `/repository` entry.

`isPlainObject` and `toText`, which the reader rests on, are public on it.

## Who is affected

- **A client that copied the Content-Range or error-envelope parsing.** Import `HttpResponseReader` from `@venizia/ignis-kernel/repository` instead.
- **Everyone else.** No change. `@venizia/ignis-connectors/http` still exports `HttpResponseReader`; it is the same class.

**Files:** [`packages/kernel/src/base/repositories/common/response-reader.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/common/response-reader.ts)

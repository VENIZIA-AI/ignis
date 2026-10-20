---
title: HttpResponseReader Maps a Failed Response to an ApplicationError
description: "HttpResponseReader.toApplicationError gives any client of an IGNIS server the connector's own error mapping, without taking the connector."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-10-17

## HttpResponseReader maps a failed response to an ApplicationError

<Badge type="tip" text="Enhancement" />

**In one line.** `HttpResponseReader.toApplicationError` turns a failed IGNIS response into the same `ApplicationError` the HTTP connector throws, from the browser-pure `@venizia/ignis-kernel/repository`.

```typescript
import { HttpResponseReader } from '@venizia/ignis-kernel/repository';

if (!response.ok) {
  throw await HttpResponseReader.toApplicationError({
    response,
    context: `[Client][read] ${response.status} | /tickets`,
  });
}
```

## What changed

- **One mapping for every client.** The error carries the status, the normalized code, args and text, `extra` with `requestId` and the relayed `upstreamRequestIds`, and `details.cause` as `cause`. A response with no text reads as `HTTP <status>`.
- **The HTTP connector uses it.** `HttpDataSource` now delegates to the reader, so its errors are unchanged.
- **`rootKey`.** Pass the server's `error.rootKey` when the server wraps its envelope.

## Who is affected

- **A client that talks to an IGNIS server without the connector.** Replace your own error mapping with `toApplicationError`.
- **Everyone else.** No action needed.

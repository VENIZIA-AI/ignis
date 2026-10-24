---
title: The Fetcher and the Socket.IO Client Run in a Browser
description: "NodeFetcher encodes JSON bodies, merges default headers, and takes query-string options; the socket.io client has a browser-pure entry. No existing behavior changes except two bug fixes."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-10-24

## The fetcher and the socket.io client run in a browser

<Badge type="tip" text="Enhancement" /> <Badge type="info" text="Bug Fix" />

**In one line.** `NodeFetcher`, `NodeFetchNetworkRequest` and `toQueryString` cover what a browser app needs, and `SocketIOClientHelper` has a browser-pure entry, so an app reuses them instead of keeping its own copies.

```typescript
const request = new NodeFetchNetworkRequest({
  name: 'api',
  networkOptions: { baseUrl: 'https://api.example.com', queryString: { nullish: 'skip', nested: 'json' } },
});

await request.getNetworkService().post({
  url: request.getRequestUrl({ paths: ['items'] }),
  params: { filter: { where: { id: 1 } } }, // ?filter=%7B%22where%22%3A%7B%22id%22%3A1%7D%7D
  body: { name: 'lamp' },                    // sent as JSON
});
```

## What changed

- **JSON bodies.** `NodeFetcher` JSON-encodes a plain object or an array. A string, `Blob`, `ArrayBuffer`, typed array, `FormData`, `URLSearchParams` or `ReadableStream` passes through; `null` or `undefined` sends no body.
- **Query-string options.** `toQueryString` takes `nullish: 'empty' | 'skip'` and `nested: 'drop' | 'json'`. `'json'` sends an object or an array as one JSON parameter (`ids=%5B1%2C2%5D`), the shape a JSON filter travels in. `NodeFetcher` and `NodeFetchNetworkRequest` take them as `queryString`. The defaults are unchanged: `node:querystring`'s behavior.
- **`getWorker()`.** `NodeFetcher.getWorker()` returns the global `fetch`; it returned `undefined`.
- **Logger type.** The fetchers' logger parameter is `TFetcherLogger = Pick<ILogger, 'debug' | 'info'>`, so a host logger with only those two methods is accepted. `NodeFetcher` logs one line at `debug` (it was `info`) and calls the logger directly instead of `logger.for(...)`. With no logger it logs nothing and builds no default logger, so a browser never reaches the node-only provider.
- **Browser socket client.** `@venizia/ignis-helpers/socket-io/client` exports `SocketIOClientHelper` with nothing node in its graph; you pass `socket.io-client` as `module`. The browser-purity gate claims the entry. `@venizia/ignis-helpers/socket-io` keeps the class name and API and finds the module itself when `module` is omitted.

## Who is affected

- **Everyone.** No action needed for the new options; defaults are unchanged.
- **A `NodeFetcher` with `defaultConfigs.headers`.** Bug fix: a call's `headers` replaced the whole default set, and a call with none dropped it, so the default `content-type` and any default token were not sent. A call's headers are now merged over the defaults name by name, and the call wins on a clash.
- **A caller that passed a plain-object body to `NodeFetcher`.** Bug fix: `fetch` received the object and sent `[object Object]`; it is now JSON.
- **Anything reading `info` lines from `NodeFetcher`.** The request line is now `debug`.

## Details

- `AbstractNetworkFetchableHelper` takes an optional `worker` in its constructor.
- The local-server test (`node-fetcher-local-server.test.ts`) drives the fetcher end to end: JSON body, JSON filter in the query, default content type, timeout and the caller's signal.

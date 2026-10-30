---
title: The Fetcher and the Socket.IO Client Run in a Browser
description: "NodeFetcher encodes JSON bodies, merges default headers and takes query-string options, and the socket.io client has a browser-pure entry."
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
- **Query-string options.** `toQueryString` takes `nullish: 'empty' | 'skip'` and `nested: 'drop' | 'json'`. `'json'` sends an object or an array as one JSON parameter (`ids=%5B1%2C2%5D`). `NodeFetcher` and `NodeFetchNetworkRequest` take them as `queryString`. The defaults are unchanged.
- **`getWorker()`.** `NodeFetcher.getWorker()` returns the global `fetch`; it returned `undefined`.
- **Logger type.** The fetchers' logger parameter is `TFetcherLogger = Pick<ILogger, 'debug' | 'info'>`. `NodeFetcher` logs its request line at `debug` (it was `info`). With no logger it logs nothing.
- **Browser socket client.** `@venizia/ignis-helpers/socket-io/client` exports `SocketIOClientHelper` with nothing node in its graph; you pass `socket.io-client` as `module`. `@venizia/ignis-helpers/socket-io` keeps the class name and API and finds the module itself when `module` is omitted.

## Who is affected

- **Everyone.** No action needed for the new options; defaults are unchanged.
- **A `NodeFetcher` with `defaultConfigs.headers`.** Bug fix: a call that passed no `headers` erased the defaults, so the default `content-type` and any default token were not sent. It now keeps them. A call that passes `headers` still replaces the defaults, as before.
- **A caller that passed a plain-object body to `NodeFetcher`.** Bug fix: `fetch` received the object and sent `[object Object]`; it is now JSON.
- **Anything reading `info` lines from `NodeFetcher`.** The request line is now `debug`.

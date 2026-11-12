---
title: HttpDataSource is half the size in a browser, and takes the sender that sends its requests
description: "HttpDataSource extends a datasource root with no dependency-injection import and sends through settings.fetch or the platform fetch. A minimal browser bundle drops from 60.4 KB to 28.2 KB. A subclass can no longer reach the protected network member."
packages: ['@venizia/ignis-connectors', '@venizia/ignis-kernel']
migration:
  - id: http-data-source-network-member
    symbols: [HttpDataSource.network]
    upgrade:
      before: |
        class SessionDataSource extends HttpDataSource {
          protected override async sendRequest(opts: { url: string }) {
            return this.network.getNetworkService().send({ url: opts.url, method: 'GET' });
          }
        }
      after: |
        const dataSource = new HttpDataSource({
          baseUrl: '/api',
          fetch: (url, init) => instrumentedFetch(url, init),
        });
    downgrade:
      steps:
        - "Remove the fetch setting; the older data source sends through its own node transport."
        - "A subclass that read this.network works again."
  - id: http-data-source-root-class
    symbols: [HttpDataSource, AbstractDataSource]
    upgrade:
      steps:
        - "HttpDataSource now extends DataSourceRoot, not AbstractDataSource, so `dataSource instanceof AbstractDataSource` is false for it. Test with isDataSourceClass, or with instanceof DataSourceRoot, both from @venizia/ignis-kernel/repository."
        - "A repository still takes it: the repository contracts accept a DataSourceRoot."
        - "A @datasource({ open: { on, timeoutMs } }) on an HttpDataSource subclass is no longer read: it opens at start with the 60 s default, which is all an HTTP client ever did."
    downgrade:
      steps:
        - "Test with instanceof AbstractDataSource again."
---

# Changelog - 2026-11-12

## HttpDataSource is half the size in a browser, and takes the sender that sends its requests

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** A browser that talks to an IGNIS server through `HttpDataSource` ships 28.2 KB instead of 60.4 KB, and you can name the function that sends each request.

## What changed

- **A root with no dependency-injection import.** `HttpDataSource` extends `DataSourceRoot` (new, from `@venizia/ignis-kernel/repository`), which holds the brand, the settings and the open state machine. `AbstractDataSource` extends it and adds what reads `@datasource` metadata, so every other datasource behaves as before.
- **A sender of your own.** `settings.fetch` is `(url, init) => Promise<Response>`. Without it the platform `fetch` sends, looked up on each call. The node transport and its logging are no longer part of the browser bundle.
- **Measured** with a minimal Vite build of one JSON `POST`: 60.4 KB raw (19.5 KB gzip) before, 28.2 KB (10.1 KB gzip) after; plain `fetch` is 0.1 KB. The rest is the data source's own code, the error and logger it needs, and the shared constants.
- **Repository contracts take a `DataSourceRoot`.** `AbstractRepository.dataSource` and the contract types widen from `AbstractDataSource`; every public member stays.

## Who is affected

- **Apps that subclass `HttpDataSource` and read `this.network`.** The member is gone. Pass `fetch` in the settings instead.
- **Code that tests `instanceof AbstractDataSource` on an `HttpDataSource`.** It is false now: see the migration below.
- **Everyone else.** No action needed; the smaller bundle is automatic.

## Breaking changes

> [!WARNING]
> `HttpDataSource.network` (protected) is removed, and an `HttpDataSource` is no longer an `AbstractDataSource`.

**Before:**

```typescript
class SessionDataSource extends HttpDataSource {
  protected override async sendRequest(opts: { url: string }) {
    return this.network.getNetworkService().send({ url: opts.url, method: 'GET' });
  }
}
```

**After:**

```typescript
const dataSource = new HttpDataSource({
  baseUrl: '/api',
  fetch: (url, init) => instrumentedFetch(url, init),
});
```

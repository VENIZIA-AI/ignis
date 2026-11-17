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
  - id: repository-data-source-type
    symbols: [AbstractRepository.dataSource, IReadableRepository, IUpdatableRepository, IDeletableRepository]
    upgrade:
      before: |
        const source: AbstractDataSource = repository.dataSource;
        repository.setDataSource({ dataSource: source });
      after: |
        import { AbstractDataSource, DataSourceRoot } from '@venizia/ignis-kernel/repository';

        const source: DataSourceRoot = repository.dataSource;
        // when you need what only an AbstractDataSource has:
        if (source instanceof AbstractDataSource) {
          // ...
        }
    downgrade:
      steps:
        - "Type the value as AbstractDataSource again; the older getter and contracts return it."
        - "Remove an `instanceof AbstractDataSource` narrowing you added only for the widened type."
  - id: http-data-source-fetch-setting
    symbols: [IHttpDataSourceSettings]
    upgrade:
      steps:
        - "Optional. To send through your own function (a test double, a proxy, an instrumented client), pass `fetch: (url, init) => ...` in the settings. Left out, the platform fetch is used, as before."
    downgrade:
      steps:
        - "Remove the fetch setting; the older settings type does not know it and the older data source ignores it."
  - id: http-data-source-root-class
    symbols: [HttpDataSource, AbstractDataSource]
    upgrade:
      steps:
        - "HttpDataSource now extends DataSourceRoot, not AbstractDataSource, so `dataSource instanceof AbstractDataSource` is false for it. Test with isDataSourceClass, or with instanceof DataSourceRoot, both from @venizia/ignis-kernel/repository."
        - "A repository still takes it: the repository contracts accept a DataSourceRoot."
        - "A @datasource({ open: { on: 'first-use' } }) on an HttpDataSource subclass is still refused at boot (the boot reads the declaration itself). A @datasource({ open: { timeoutMs } }) on it is no longer read: an HTTP client opens nothing, so there is nothing to time out."
        - "A subclass that calls the protected discoverDefinitions() or getBoundModelClasses() stops compiling: they belong to AbstractDataSource, which reads the model metadata. An HTTP client has no models bound to it; delete the call, or extend AbstractDataSource yourself if you need them."
    downgrade:
      steps:
        - "Test with instanceof AbstractDataSource again."
        - "A call to discoverDefinitions() or getBoundModelClasses() in a subclass compiles again."
---

# Changelog - 2026-11-12

## HttpDataSource is half the size in a browser, and takes the sender that sends its requests

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** A browser that talks to an IGNIS server through `HttpDataSource` ships 28.2 KB instead of 60.4 KB, and you can name the function that sends each request.

## What changed

- **A root with no dependency-injection import.** `HttpDataSource` extends `DataSourceRoot` (new, from `@venizia/ignis-kernel/repository`), which holds the brand, the settings and the open state machine. `AbstractDataSource` extends it and adds what reads `@datasource` metadata, so every other datasource behaves as before.
- **A sender of your own.** `settings.fetch` is `(url, init) => Promise<Response>`. Without it the platform `fetch` sends, looked up on each call. The node transport is no longer part of the browser bundle.
- **Measured** with a minimal Vite build of one JSON `POST`: 60.4 KB raw (19.5 KB gzip) before, 28.2 KB (10.1 KB gzip) after; plain `fetch` is 0.1 KB. The rest is the data source's own code, the error and logger it needs, and the shared constants.
- **Repository contracts take a `DataSourceRoot`.** `AbstractRepository.dataSource` and the contract types widen from `AbstractDataSource`; every public member stays.

## Who is affected

- **Apps that subclass `HttpDataSource` and read `this.network`.** The member is gone. Pass `fetch` in the settings instead.
- **Code that tests `instanceof AbstractDataSource` on an `HttpDataSource`.** It is false now: see the migration below.
- **`HttpDataSource` subclasses that call `discoverDefinitions()` or `getBoundModelClasses()`.** They stop compiling; an HTTP client has no bound models.
- **Code that types `repository.dataSource` as `AbstractDataSource`.** The getter and the repository contracts return `DataSourceRoot` now, so that assignment stops compiling; type it as `DataSourceRoot`, or narrow with `instanceof AbstractDataSource`.
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

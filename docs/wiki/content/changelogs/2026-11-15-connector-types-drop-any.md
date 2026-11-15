---
title: The connector types stop defaulting to any
description: "HttpRepository, the raw SQL repository, the driver datasource, the search controller and the Meilisearch task types say what they hold instead of any."
packages: ['@venizia/ignis-connectors']
migration:
  - id: http-repository-defaults
    symbols: [HttpRepository, HttpRepository.patchWhere, HttpRepository.deleteWhere]
    upgrade:
      before: |
        // E defaulted to any: field names and returned rows were unchecked
        const repository = new HttpRepository({ resource: 'articles', dataSource });
        const created = await repository.create({ data: { title: 'x' } });
        created.data.title; // any
        await repository.find({ filter: { where: { title: 'x' } } });
      after: |
        // name the row type: E defaults to object, so the returned rows carry no properties and no field name is accepted
        const repository = new HttpRepository<IArticle>({ resource: 'articles', dataSource });
        const created = await repository.create({ data: { title: 'x' } });
        created.data.title;
        await repository.find({ filter: { where: { title: 'x' } } });
    downgrade:
      steps:
        - "Drop the type argument; the older default let every read and every field name compile."
    data: "The protected patchWhere and deleteWhere now answer data: unknown, and search() answers IHttpSearchResult<object> without a row type: a subclass that reads .data.x from them needs the row type or a narrow. Reading find() rows without a type argument still compiles (a keyless object selects any)."
  - id: raw-sql-repository-datasource-type
    symbols: [BaseRawSqlRepository]
    upgrade:
      before: |
        class ReportRepository extends BaseRawSqlRepository {
          rows() { return this.dataSource.settings.schema; } // any
        }
      after: |
        // dataSource is BaseRawSqlDataSource<object, unknown, TConnector>: read settings through your own datasource type
        class ReportRepository extends BaseRawSqlRepository {
          constructor(readonly reports: ReportDataSource) { super(reports); }
          rows() { return this.reports.settings.schema; }
        }
    downgrade:
      steps:
        - "Read this.dataSource.settings directly again; it was typed any."
  - id: driver-datasource-types
    symbols: [AbstractDriverDataSource, AbstractDriverDataSource.mapSecretToSettings]
    upgrade:
      before: |
        // the protected hook returned AnyObject: an interface return and any property read compiled
        interface IPgSecret { user: string; password: string }
        class MyDataSource extends AbstractDriverDataSource<ISettings, Schema, {}, Client, Connector, MyDriver> {
          protected override mapSecretToSettings(opts: { secret: Record<string, string> }): IPgSecret { /* ... */ } // TS2416 now
        }
        const user = this.mapSecretToSettings({ secret }).user.toLowerCase();
      after: |
        // it returns Record<string, unknown>: return that (or declare the shape as a type alias) and narrow what you read;
        // the TDriver constraint is IConnectorDriver<TConnector, unknown>
        type TPgSecret = { user: string; password: string };
        class MyDataSource extends AbstractDriverDataSource<ISettings, Schema, {}, Client, Connector, MyDriver> {
          protected override mapSecretToSettings(opts: { secret: Record<string, string> }): TPgSecret { /* ... */ }
        }
        const mapped = this.mapSecretToSettings({ secret });
        const user = typeof mapped.user === 'string' ? mapped.user.toLowerCase() : undefined;
    downgrade:
      steps:
        - "Return the interface and read the mapped settings without a narrow again; the older return was any-valued."
  - id: search-controller-definitions
    symbols: [AbstractSearchController]
    upgrade:
      before: |
        // definitions was any: an interface-typed object fit
        interface ISearchDefinitions { search: IAuthRouteConfig }
        declare const searchRoute: IAuthRouteConfig;
        const definitions: ISearchDefinitions = { search: searchRoute };
        super({ scope: 'SearchController', repository, definitions }); // TS2322 now: no index signature
      after: |
        // definitions is Record<string, IAuthRouteConfig>: use a type alias or satisfies
        const definitions = { search: searchRoute } satisfies Record<string, IAuthRouteConfig>;
        super({ scope: 'SearchController', repository, definitions });
    downgrade:
      steps:
        - "Nothing to restore: a definitions object that fits the newer type fits the older any one."
  - id: meilisearch-polled-task
    symbols: [IMeilisearchClientLike, IMeilisearchPolledTask, IMeilisearchTask]
    upgrade:
      before: |
        const task = await client.getTask(7);
        const id: number = task.taskUid; // IMeilisearchTask.taskUid was required
      after: |
        // getTask answers IMeilisearchPolledTask: the SDK names the id uid, so taskUid may be absent
        const task = await client.getTask(7);
        const id: number | undefined = task.taskUid;
    downgrade:
      steps:
        - "Nothing to restore: a getTask implementation that carries taskUid fits both types; reads that assumed taskUid compile again with IMeilisearchTask."
    data: "A caller that reads taskUid from a polled task must handle undefined. The real SDK never set it, so a message that printed it showed undefined before as well."
---

# Changelog - 2026-11-15

## The connector types stop defaulting to any

<Badge type="warning" text="Breaking Change" />

**In one line.** The HTTP, raw SQL, driver datasource, search controller and Meilisearch types say what they hold instead of `any`, and nothing changes at runtime.

## What changed

- **HTTP.** `HttpRepository`'s row type has no `any` default and its write verbs answer `data: unknown`.
- **Raw SQL.** `BaseRawSqlRepository.dataSource` is `BaseRawSqlDataSource<object, unknown, TConnector>`.
- **Datasource.** `AbstractDriverDataSource`'s driver constraint is `IConnectorDriver<TConnector, unknown>`; `mapSecretToSettings` returns `Record<string, unknown>`.
- **Search.** `AbstractSearchController` takes `definitions: Record<string, IAuthRouteConfig>`.
- **Meilisearch.** `getTask` answers `IMeilisearchPolledTask`, the task with an optional `taskUid`.

## Who is affected

- **Code that uses `HttpRepository` without a row type, reads a raw SQL repository's `dataSource.settings` untyped, overrides `mapSecretToSettings` with an interface return, passes an interface-typed `definitions` object to a search controller, or implements `IMeilisearchClientLike`.** See the migration above.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
const repository = new HttpRepository({ resource: 'articles', dataSource });
const created = await repository.create({ data: { title: 'x' } });
created.data.title;
```

**After:**

```typescript
const repository = new HttpRepository<IArticle>({ resource: 'articles', dataSource });
const created = await repository.create({ data: { title: 'x' } });
created.data.title;
```

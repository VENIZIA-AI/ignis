---
title: The connector types stop defaulting to any
description: "HttpRepository, the raw SQL repository, the driver datasource, the search controller and the Meilisearch task types say what they hold instead of any."
packages: ['@venizia/ignis-connectors']
migration:
  - id: http-repository-defaults
    symbols: [HttpRepository]
    upgrade:
      before: |
        const repository = new HttpRepository({ dataSource }); // E defaulted to any
        const rows = await repository.find({});
        rows[0].title; // any
        const result = await repository.updateById({ id: 1, data: { title: 'x' } });
        result.data.title; // any
      after: |
        // name the row type: E has no usable default
        const repository = new HttpRepository<IArticle>({ dataSource });
        const result = await repository.updateById({ id: 1, data: { title: 'x' } });
        // the write verbs answer data: unknown; narrow it or pass the row type
        const row = await repository.updateById<IArticle>({ id: 1, data: { title: 'x' } });
    downgrade:
      steps:
        - "Drop the type argument and read the rows as any again; every read compiled."
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
        class MyDataSource extends AbstractDriverDataSource<ISettings, Schema, {}, Client, Connector, MyDriver> {
          protected override mapSecretToSettings(opts: { secret: Record<string, string> }): AnyObject {
            return { user: opts.secret.username };
          }
        }
      after: |
        // the TDriver constraint is IConnectorDriver<TConnector, unknown>; the protected hook returns Record<string, unknown>
        class MyDataSource extends AbstractDriverDataSource<ISettings, Schema, {}, Client, Connector, MyDriver> {
          protected override mapSecretToSettings(opts: { secret: Record<string, string> }): Record<string, unknown> {
            return { user: opts.secret.username };
          }
        }
    downgrade:
      steps:
        - "Type the override's return as Record<string | symbol | number, any> again."
  - id: search-controller-definitions
    symbols: [AbstractSearchController]
    upgrade:
      before: |
        super({ scope: 'SearchController', repository, definitions: { find: { authenticate: { strategies: ['jwt'] } } } as any });
      after: |
        // definitions is Record<string, IAuthRouteConfig>
        super({ scope: 'SearchController', repository, definitions: { find: { authenticate: { strategies: ['jwt'] } } } });
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

- **Code that uses `HttpRepository` without a row type, reads a raw SQL repository's `dataSource.settings` untyped, overrides `mapSecretToSettings`, or implements `IMeilisearchClientLike`.** See the migration above.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
const repository = new HttpRepository({ dataSource });
```

**After:**

```typescript
const repository = new HttpRepository<IArticle>({ dataSource });
```

---
title: A Datasource Family for Engines That Only Run SQL
description: 'New @venizia/ignis-connectors/raw-sql sub-path: BaseRawSqlDataSource and BaseRawSqlRepository for an analytics engine (ClickHouse, DuckDB, BigQuery) that runs SQL text and returns rows, with the driver lifecycle shared with the relational datasources.'
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-26

## A datasource family for engines that only run SQL

<Badge type="tip" text="New Feature" />

**In one line.** An engine that runs SQL text and returns rows now has its own datasource and repository base, without the dialect, executor and transaction members a relational datasource needs. Ships in 0.4.4.

## What changed

- **`@venizia/ignis-connectors/raw-sql`.** `BaseRawSqlDataSource`, `BaseRawSqlRepository<TConnector>`, `IRawSqlConnector` (`execute(query)` returns `{ rows }`), `TRawSqlDriver`, `TRawSqlQuery`, `IRawSqlResult` and `RawSqlEntity`. IGNIS ships no engine connector: you write the connector and the driver.
- **A neutral driver base.** The driver wiring, close-once, secret rotation and drain that `AbstractRelationalDataSource` carried now live in `AbstractDriverDataSource`, with `IConnectorDriver` (`createConnector`, `getClient`, `end`) as its driver contract. Both are exported from `@venizia/ignis-connectors`. `IRelationalDriver` extends `IConnectorDriver` and adds `acquire`.
- **No transactions, no stubs.** A raw-SQL datasource reports `{ transactions: false }` and `beginTransaction()` rejects with NotSupported, as the kernel's `AbstractDataSource` already does.

## Who is affected

- **You run an analytics engine beside your main database.** Follow [Raw SQL Engines](/guides/core-concepts/persistent/raw-sql) for the connector, driver, datasource and repository, on a fake engine.
- **You use Postgres or SQLite datasources.** No action needed. The relational datasources behave as before; the existing connectors tests pass unchanged.
- **You extend `AbstractRelationalDataSource` directly.** No action needed. It still exposes the same members; they are inherited from the new base.

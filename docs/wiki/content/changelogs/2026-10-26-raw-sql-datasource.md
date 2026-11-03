---
title: A Datasource Family for Engines That Only Run SQL
description: "New @venizia/ignis-connectors/raw-sql sub-path with BaseRawSqlDataSource and BaseRawSqlRepository for an engine (ClickHouse, DuckDB, BigQuery) that runs SQL text and returns rows."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-26

## A datasource family for engines that only run SQL

<Badge type="tip" text="New Feature" />

**In one line.** An engine that runs SQL text and returns rows now has its own datasource and repository base, without the dialect, executor and transaction members a relational datasource needs. Ships in 0.4.4.

## What changed

- **`@venizia/ignis-connectors/raw-sql`.** `BaseRawSqlDataSource`, `BaseRawSqlRepository<TConnector>`, `IRawSqlConnector` (`execute(query)` returns `{ rows }`), `TRawSqlDriver`, `TRawSqlQuery`, `IRawSqlResult` and `RawSqlEntity`. IGNIS ships no engine connector: you write the connector and the driver.
- **A neutral driver base.** `AbstractDriverDataSource` and `IConnectorDriver` (`createConnector`, `getClient`, `end`) are exported from `@venizia/ignis-connectors`. `IRelationalDriver` extends `IConnectorDriver` and adds `acquire`.
- **No transactions.** A raw-SQL datasource reports `{ transactions: false }` and `beginTransaction()` rejects with NotSupported.

## Who is affected

- **You run an analytics engine beside your main database.** Follow [Raw SQL Engines](/guides/core-concepts/persistent/raw-sql).
- **You use Postgres or SQLite datasources, or extend `AbstractRelationalDataSource` directly.** No action needed. Behavior and members are the same.

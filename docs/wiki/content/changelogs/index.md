---
title: Changelogs
description: History of significant changes, refactors, and updates to the IGNIS framework
---

# Changelogs

This section tracks the history of significant changes, refactors, and updates to the IGNIS framework.

## Planned Features

| Feature | Description | Priority |
|---------|-------------|----------|
| [Schema Migrator](./planned-schema-migrator) | LoopBack 4-style auto schema migration without Drizzle Kit | High |

## Recent Changes

| Date | Title | Type |
|------|-------|------|
| 2026-08-21 | [Services Prove Themselves to Each Other, Without a Shared Password](./2026-08-21-service-authentication-strategy) | New Feature, Security |
| 2026-08-19 | [Your Own Authentication Strategies, and Tokens That Say Who They Are For](./2026-08-19-service-authentication-phase-1) | New Feature, Security, Enhancement, Breaking Change |
| 2026-08-19 | [A Browser BFF That Survives a Second Tab](./2026-08-19-browser-bff-multi-tab) | New Feature, Security, Breaking Change, Bug Fix |
| 2026-08-18 | [A Second ID Generator, for IDs People Read](./2026-08-18-opaque-uid-helper) | New Feature |
| 2026-08-18 | [Every Browser-Safe Package Now Ships ESM](./2026-08-18-esm-builds-and-one-default-stack) | Enhancement, Bug Fix, Behavior Change |
| 2026-08-13 | [A Browser-Pure Kernel Under `@venizia/ignis`](./2026-08-13-browser-pure-kernel) | New Feature, Enhancement, Internal Refactor |
| 2026-08-12 | [Log Arguments Under `%j` No Longer Collapse to `[Circular]`](./2026-08-12-json-log-arguments) | Bug Fix, Security, Behavior Change |
| 2026-08-07 | [Call Sites No Longer Have to Know Which Fields Are Text](./2026-08-07-default-query-by) | New Feature, Enhancement |
| 2026-08-07 | [Nested i18n Fields Become Filterable and Sortable](./2026-08-07-nested-fields-and-order-validation) | New Feature, Bug Fix, Behavior Change |
| 2026-08-07 | [One Transport for Every Typesense Search](./2026-08-07-typesense-multi-search-transport) | New Feature, Bug Fix, Behavior Change |
| 2026-08-06 | [AES Keys Derive with PBKDF2, and Ciphertext Carries a Key Id](./2026-08-06-aes-pbkdf2-and-key-rotation) | Breaking Change, Security, New Feature |
| 2026-08-05 | [Search Filters Now Mean What Relational Filters Mean](./2026-08-05-search-dialect-relational-parity) | Security, Breaking Change, Bug Fix, Enhancement |
| 2026-08-02 | [SQLite and PGlite - Two Embedded Relational Engines](./2026-08-02-sqlite-and-pglite-connectors) | New Feature, Enhancement |
| 2026-08-01 | [Relational Connector Lift - Engine-Neutral SQL Tier](./2026-08-01-relational-connector-lift) | Breaking Change, Enhancement, Bug Fix, Behavior Change |
| 2026-07-26 | [Search and Mail Errors Join the Framework Catalog](./2026-07-26-search-and-mail-error-codes) | Enhancement |
| 2026-07-25 | [ignis-filter - the Filter Vocabulary as a Browser-Safe Package](./2026-07-25-ignis-filter-package) | New Package, Enhancement |
| 2026-07-25 | [Readable Error Logs and a logLevel Option on getError](./2026-07-25-error-logging) | New Feature, Enhancement |
| 2026-07-21 | [BaseFilteredAdapter Connector Resolution Fix](./2026-07-21-casbin-connector-resolution-fix) | Bug Fix |
| 2026-07-20 | [fromError - Rehydrate a Server Error on the Client](./2026-07-20-error-from-error-client) | New API |
| 2026-07-20 | [Casbin Single-Wave Extraction - Recursive CTE Replaces the Second Query Wave](./2026-07-20-casbin-single-wave-extraction) | Enhancement, Behavior Change, Bug Fix |
| 2026-07-20 | [Casbin Custom Grants - Operation-Subset Grants in One Row](./2026-07-20-casbin-custom-grants) | New Feature, Enhancement |
| 2026-07-18 | [Logger Overhaul - ILogger Tier, Pino Provider, Single-Provider Loading](./2026-07-18-logger-overhaul) | Breaking Change, New Feature, Enhancement, Bug Fix |
| 2026-07-18 | [Dependency Refresh \& DI Cleanup](./2026-07-18-dependency-refresh) | Maintenance, Breaking Change, Bug Fix |
| 2026-07-18 | [Repository Read Retry - Predicate-Driven Retries for Replica Lag](./2026-07-18-repository-read-retry) | New Feature |
| 2026-07-17 | [Error Module Redesign](./2026-07-17-error-module-redesign) | Breaking Change, Enhancement |
| 2026-07-17 | [Logger Correctness Pass](./2026-07-17-logger-correctness-pass) | Bug Fix, Enhancement, Behavior Change |
| 2026-07-17 | [Secrets Peers Invisible to Bundlers - No More external node-vault](./2026-07-17-secrets-bundler-invisible-peers) | Bug Fix, Behavior Change |
| 2026-07-16 | [Error Handling - Normalized Messages, Error Catalog, and a Recovered cause](./2026-07-16-error-catalog-and-structured-message) | Bug Fix, Enhancement, New API |
| 2026-07-16 | [Secrets & Vault Integration](./2026-07-16-secrets-vault-integration) | New Feature, Enhancement |
| 2026-07-14 | [Optional Peers, Actually Optional - The Driver Is a Class Now](./2026-07-14-driver-class-bundling) | Breaking Change, Bug Fix, Enhancement |
| 2026-07-13 | [The Hardening Round - SQL Injection, Scope Escapes and Silent Leaks](./2026-07-13-hardening-round) | Security, Breaking Change, Bug Fix, Enhancement |
| 2026-07-12 | [Core Consolidation & Deduplication - Mixin Functions Removed, Narrowing Default-Filter Merge, isApplicationError](./2026-07-12-core-consolidation-dedup) | Breaking Change, Enhancement, Bug Fix |
| 2026-07-11 | [Postgres Driver Seam & Supabase - Transaction Correctness, postgres-js, RLS Auth Context](./2026-07-11-postgres-driver-seam-supabase) | New Feature, Refactor, Breaking Change, Security |
| 2026-07-11 | [Connectors Consistency Hardening - Strict find(), engineParams, SQL-Semantics Parity](./2026-07-11-connectors-consistency-hardening) | Bug Fix, Enhancement, Breaking Change |
| 2026-07-08 | [Typesense Advanced Search - Vector/Semantic, Multi-Search, Synonyms](./2026-07-08-typesense-advanced-search) | New Feature, Breaking Change |
| 2026-07-05 | [Unified Repository & Connectors Architecture - PostgreSQL, Typesense & Memory Engines](./2026-07-05-unified-repository-connectors) | New Feature, Refactor, Breaking Change |
| 2026-06-25 | [Redis Helpers Refactor - Abstract Base, Interfaces, Sentinel & Factory](./2026-06-25-redis-helpers-refactor) | Refactor, New Feature, Breaking Change |
| 2026-06-18 | [Current User Information Endpoint - GET /me & who-am-i Flag](./2026-06-18-auth-user-information-endpoint) | New Feature |
| 2026-06-14 | [Validation Message Codes, SQLSTATE-Class DB Errors & Production Error Hardening](./2026-06-14-validation-codes-and-error-hardening) | New Feature, Security, Breaking Change |
| 2026-06-02 | [Scoped RBAC Authorization - Edge-Table Model, Pooled Enforcer, Redis-Only Cache](./2026-06-02-authorize-scoped-rbac) | New Feature, Breaking Change |
| 2026-05-27 | [Casbin Domain Matching Function - Wildcard/Pattern Domains in `g`](./2026-05-27-casbin-domain-matching-function) | New Feature |
| 2026-05-25 | [Per-Model Default Limit via @model Settings](./2026-05-25-per-model-default-limit) | New Feature |
| 2026-05-22 | [Drizzle Casbin Adapter - Schema-Qualified Tables](./2026-05-22-casbin-adapter-schema-qualification) | Enhancement, Breaking Change |
| 2026-05-21 | [Mass Update/Delete Guards - Blank Id & Empty Where](./2026-05-21-mass-mutation-guards) | Bug Fix, Security |
| 2026-05-20 | [Consistent Default Limit for To-Many Relations](./2026-05-20-relation-scope-default-limit) | Bug Fix, Breaking Change |
| 2026-05-08 | [CRUD Route Toggles & Typed JSON Responses](./2026-05-08-crud-route-toggles-and-typed-responses) | New Feature, Enhancement |
| 2026-05-05 | [Refresh Access Token Endpoint](./2026-05-05-refresh-token-endpoint) | New Feature |
| 2026-04-23 | [Error Responses - messageCode & Extra Fields](./2026-04-23-error-response-extra-fields) | Enhancement |
| 2026-03-31 | [TypeScript 6 Upgrade & Toolchain Refresh](./2026-03-31-typescript-6-and-toolchain) | Maintenance |
| 2026-03-30 | [Row-Level Locking (FOR UPDATE)](./2026-03-30-row-level-locking) | New Feature |
| 2026-03-15 | [gRPC Support - ConnectRPC Integration, BaseGrpcController, RPC Decorators](./2026-03-15-grpc-controller-system) | New Feature |
| 2026-03-12 | [Kafka Helpers Enhancement - Health, Callbacks, Transactions, Schema Registry](./2026-03-12-kafka-helpers-enhancement) | Enhancement, New Feature |
| 2026-03-10 | [Kafka Helpers Refactor & @platformatic/kafka v1.30.0](./2026-03-10-kafka-helpers-refactor) | Refactor, Breaking Change |
| 2026-03-06 | [Filter Offset/Skip Bug Fix](./2026-03-06-filter-offset-skip-fix) | Bug Fix |
| 2026-03-04 | [Customizable JWT Payload Field Codecs](./2026-03-04-jwt-payload-field-codecs) | New Feature, Breaking Change |
| 2026-03-02 | [Model Authorize Settings](./2026-03-02-model-authorize-settings) | New Feature |
| 2026-02-27 | [JWKS Authentication & Service Hierarchy Refactor](./2026-02-27-jwks-authentication) | New Feature, Refactor, Breaking Change, Security |
| 2026-02-26 | [Core/Helpers Decoupling](./2026-02-26-core-helpers-decoupling) | Refactor, Breaking Change |
| 2026-02-16 | [Authorization System & Auth Module Refactor](./2026-02-16-authorization-system) | New Feature, Refactor, Breaking Change |
| 2026-02-11 | [WebSocket Generic Type Parameters](./2026-02-11-websocket-generic-types) | Enhancement |
| 2026-02-11 | [WebSocket Encrypted Delivery](./2026-02-11-websocket-encrypted-delivery) | New Feature |
| 2026-02-11 | [Crypto Algorithm Refactor & ECDH](./2026-02-11-crypto-refactor-ecdh) | Refactor, New Feature, Breaking Change |
| 2026-02-10 | [WebSocket Heartbeat & Payload Limit](./2026-02-10-websocket-heartbeat-payload) | New Feature, Enhancement |
| 2026-02-06 | [Socket.IO Integration Fix](./2026-02-06-socket-io-integration-fix) | Bug Fix, New Feature, Breaking Change |
| 2026-01-11 | [Logger Optimization & HfLogger](./2026-01-11-logger-optimization-hf-logger) | Enhancement, New Feature |
| 2026-01-07 | [Controller Route Customization](./2026-01-07-controller-route-customization) | New Feature |
| 2026-01-06 | [Basic Authentication Strategy](./2026-01-06-basic-authentication) | New Feature |
| 2026-01-05 | [Range Queries & Content-Range Header](./2026-01-05-range-queries-content-range) | New Feature |
| 2026-01-02 | [Default Filter & Repository Mixins](./2026-01-02-default-filter-and-repository-mixins) | New Feature |
| 2025-12-31 | [JSON Path Filtering & Array Operators](./2025-12-31-json-path-filtering-array-operators) | New Feature |
| 2025-12-31 | [String ID with Custom Generator](./2025-12-31-string-id-custom-generator) | Enhancement |
| 2025-12-30 | [Repository Enhancements](./2025-12-30-repository-enhancements) | Enhancement |
| 2025-12-29 | [Snowflake UID Helper](./2025-12-29-snowflake-uid-helper) | New Feature |
| 2025-12-29 | [Dynamic Binding Registration Fix](./2025-12-29-dynamic-binding-registration) | Bug Fix |
| 2025-12-26 | [Transaction Support](./2025-12-26-transaction-support) | Enhancement |
| 2025-12-26 | [Nested Relations & Generic Types](./2025-12-26-nested-relations-and-generics) | Enhancement |
| 2025-12-18 | [Performance Optimizations](./2025-12-18-performance-optimizations) | Enhancement |
| 2025-12-18 | [Repository Validation & Security](./2025-12-18-repository-validation-security) | Breaking Change, Security |
| 2025-12-17 | [Inversion of Control Refactor](./2025-12-17-refactor) | Refactor |
| 2025-12-16 | [Model-Repository-DataSource Refactor](./2025-12-16-model-repo-datasource-refactor) | Breaking Change |
| 2025-12-16 | [Initial Architecture](./2025-12-16-initial-architecture) | Documentation |

## How to Read Changelogs

Each changelog entry includes:
- **Overview**: Summary of changes
- **Breaking Changes**: Any changes that require migration
- **New Features**: New capabilities added
- **Files Changed**: List of modified files
- **Migration Guide**: Steps to update existing code (if applicable)

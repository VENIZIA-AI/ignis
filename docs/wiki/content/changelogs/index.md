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
| 2026-09-12 | [Empty Env Values Are Allowed By Default](./2026-09-12-empty-envs-allowed-by-default) | Breaking |
| 2026-09-12 | [A Blank Env Line No Longer Beats Its Default At Module Load](./2026-09-12-blank-env-at-module-load) | Fix |
| 2026-09-12 | [An Env Read Now Does What It Promises](./2026-09-12-env-reads-what-it-promises) | Breaking |
| 2026-09-12 | [A Redis Cluster Takes autoConnect Like Every Other Topology](./2026-09-12-cluster-auto-connect) | Enhancement |
| 2026-09-11 | [Atlas Serves Any VENIZIA Family Checkout](./2026-09-11-atlas-family-checkouts) | Enhancement |
| 2026-09-11 | [A Build Stamps Itself, And Health Answers Twice](./2026-09-11-build-info-and-health-stats) | Feature |
| 2026-09-10 | [Application Configurations and Type-Safe Component Options](./2026-09-10-configuration-and-component-options) | Feature |
| 2026-09-09 | [A Dependency Can Now Name Its Class Instead Of Its Key](./2026-09-09-inject-by-class) | Feature |
| 2026-09-09 | [The Log Names Every Reason An AggregateError Collected](./2026-09-09-aggregate-error-logging) | Fix |
| 2026-09-09 | [A Url From User Input Can No Longer Reach Inside Your Network](./2026-09-09-guarded-url-fetch) | Security |
| 2026-09-08 | [Every Storage Method Names Its Bucket and Its Object](./2026-09-08-storage-scoped-vocabulary) | Breaking |
| 2026-09-08 | [A Binding Namespace That Would Lose Its Tag Is Refused](./2026-09-08-binding-namespace-guard-and-zod-type) | Behavior Change |
| 2026-09-08 | [Storage Serves Safely, Answers 404, and Runs on Bun S3 Alone](./2026-09-08-storage-hardening-and-bun-s3-only) | Security |
| 2026-09-07 | [Storage Gains Presigned URLs and Object Tagging](./2026-09-07-storage-presign-and-tagging) | New Feature |
| 2026-09-07 | [The Static-Asset Controller Takes a Configured Bucket and Raw Nested Paths](./2026-09-07-asset-single-bucket-and-raw-paths) | New Feature |
| 2026-09-07 | [Atlas Recognises the IGNIS Checkout by Its Workspace Manifest](./2026-09-07-atlas-checkout-detection) | Bug Fix |
| 2026-09-07 | [Atlas Gains version and changes Tools and a Generated Release Table](./2026-09-07-atlas-versions) | New Feature |
| 2026-09-07 | [CRUD Controllers Narrow Their Rows; The Asset Controller Takes Two Hooks](./2026-09-07-crud-scope-and-asset-hooks) | New Feature |
| 2026-09-07 | [WorkerApplication Gains configs.projectRoot; BaseKafkaHelper Turns protected](./2026-09-07-worker-project-root-and-kafka-base-seams) | New Feature |
| 2026-09-07 | [Atlas Gains a symbol Tool and a Generated Symbol Table](./2026-09-07-atlas-symbols) | New Feature |
| 2026-09-06 | [BullMQHelper and KafkaConsumerHelper Gain Extension Seams](./2026-09-06-helpers-queue-seams) | New Feature |
| 2026-09-06 | [setListHeaders Takes offset + total; toContentRange Is Exported](./2026-09-06-list-headers-from-offset-and-total) | New Feature |
| 2026-09-06 | [ignis-artifacts Warns When an --ignore Pattern Hides a Decorated Class](./2026-09-06-generator-warns-on-ignored-artifacts) | New Feature |
| 2026-09-06 | [configs.artifacts Accepts { when, index } Entries - the Run-Mode Gate Lives in the Config](./2026-09-06-conditional-artifact-index-entries) | New Feature |
| 2026-09-06 | [configs.projectRoot Replaces the getProjectRoot() Override](./2026-09-06-configs-project-root) | New Feature |
| 2026-09-06 | [ignis-artifacts check Compares the Index Body, Not Its Header Line](./2026-09-06-artifacts-check-compares-the-body) | Behavior Change |
| 2026-09-06 | [helpers Declares Its @hono/zod-openapi Peer; the Generated Index Header Names the Command That Produced It](./2026-09-06-helpers-peer-and-generator-header) | Behavior Change |
| 2026-09-06 | [configs.server Passes idleTimeout and maxRequestBodySize to Bun.serve](./2026-09-06-bun-serve-options) | New Feature |
| 2026-09-06 | [A Bare @repository() Inherits Its Parent's Model and Datasource; the Console Fallback Warns on the First Log Line; ignis-artifacts Runs Silently](./2026-09-06-repository-inheritance-and-quiet-cli) | New Feature, Bug Fix |
| 2026-09-06 | [applicationEnvironment and the Module Registry Are Shared Across Module Copies; configs.path.base Is Checked at Construction](./2026-09-06-shared-singletons-across-module-copies) | Bug Fix |
| 2026-09-06 | [ignis-docs-mcp Is Replaced by @venizia/ignis-atlas](./2026-09-06-ignis-atlas) | Behavior Change |
| 2026-09-05 | [@venizia/ignis No Longer Depends on @venizia/ignis-boot](./2026-09-05-core-drops-boot-dependency) | Behavior Change |
| 2026-09-05 | [Boot Checks - Every Binding Resolves, No Hand Registration Beside the Generated Index, No Silent Key Override](./2026-09-05-boot-checks) | New Feature |
| 2026-09-05 | [List Responses Share One Contract - respond Takes a Range on BaseRestController, and POST /search Gets Its Headers](./2026-09-05-list-response-contract) | New Feature, Bug Fix, Breaking Change |
| 2026-09-04 | [Dependency Floors Raised Across the Chain, Audit Down to Six Accepted Advisories](./2026-09-04-dependency-floors-raised) | Enhancement, Security, Breaking Change |
| 2026-09-03 | [The Deprecated Runtime Boot API Is Fully Removed](./2026-09-03-deprecated-boot-api-removed) | Breaking Change |
| 2026-09-02 | [Bundled and Compiled Apps - Helpers Exports Stay Defined, NODE_ENV Stays a Runtime Read, One Logger Provider Across Copies](./2026-09-02-bundle-safe-helpers) | Bug Fix, Enhancement |
| 2026-09-02 | [Artifacts Register From a Generated Index, and the Runtime Boot System Is Retired](./2026-09-02-decorator-artifact-registration) | New Feature, Breaking Change |
| 2026-08-31 | [EventBus Retry Gets Jitter, a Bounded Per-Registration Window, and a Tagged Handler Reference](./2026-08-31-event-bus-retry) | New Feature, Enhancement, Breaking Change |
| 2026-08-31 | [TEntityId Makes a String Id Impossible to Confuse With a String](./2026-08-31-entity-id-brand) | New Feature |
| 2026-08-31 | [PolicyDefinition Gets domain_type and domain_id (Release A - Both Forms Written)](./2026-08-31-policy-domain-split) | New Feature, Migration Required |
| 2026-08-31 | [An Application Refuses to Start When scopeFilter Cannot Take Effect](./2026-08-31-scope-filter-boot-checks) | Security, Behavior Change |
| 2026-08-31 | [PolicyDefinition Reads the Domain Pair and the domain Column Is Gone (Release B)](./2026-08-31-policy-domain-split-release-b) | Breaking Change, Migration Required |
| 2026-08-30 | [A Row Scope Every Query Carries, Denied by Default When It Cannot Be Resolved](./2026-08-30-row-scope-filter) | New Feature, Security |
| 2026-08-30 | [Where Clauses Now Type-Check the Value, Not Just the Column](./2026-08-30-typed-where-clauses) | Breaking Change, Enhancement |
| 2026-08-30 | [Tree Utilities Join helpers, and RecursiveTreeSql Bounds Every Recursive Walk in kernel](./2026-08-30-tree-and-recursive-sql) | New Feature, Security |
| 2026-08-30 | [A Real Hash Class Replaces the Removed hash() Utility](./2026-08-30-crypto-hashing) | New Feature, Security, Breaking Change |
| 2026-08-30 | [PolicyDefinition.variant Stays Closed by Default, but an App Can Now Declare Its Own Edge Kinds](./2026-08-30-policy-definition-extra-variants) | Enhancement |
| 2026-08-30 | [authorize() Denies When No Enforcer Is Registered](./2026-08-30-authorize-no-enforcer-fails-closed) | Security, Breaking Change |
| 2026-08-30 | [getHealth() Never Throws, Imports Keep Progress, and collectionExists() Never Lies About Absence](./2026-08-30-search-connector-health-and-import-contract) | Behavior Change, Bug Fix |
| 2026-08-29 | [Casbin Domain Hierarchy - Parent Domains Reach Their Children](./2026-08-29-casbin-domain-hierarchy) | New Feature |
| 2026-08-24 | [Two Query Shapes You No Longer Have to Rebuild](./2026-08-24-query-wrapper-schemas) | New API, Enhancement |
| 2026-08-22 | [Log Lines Stop Carrying Color Outside Development](./2026-08-22-logger-color-off-outside-development) | Behavior Change, Enhancement |
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

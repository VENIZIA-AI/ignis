---
title: The old function names are removed, and one codemod moves your calls
description: 'Every public function that moved into a class loses its old name in this release; devz codemod namespace-functions rewrites the calls, and a short list of removals (MinIO, a few helpers) needs a manual step.'
packages: ['@venizia/ignis-inversion', '@venizia/ignis-filter', '@venizia/ignis-helpers', '@venizia/ignis-boot', '@venizia/ignis-kernel', '@venizia/ignis-connectors', '@venizia/ignis-worker', '@venizia/ignis', '@venizia/dev-configs']
---

# Changelog - 2026-11-01

## The old function names are removed, and one codemod moves your calls

<Badge type="warning" text="Breaking Change" />

**In one line.** The 184 public functions that moved into classes (for example `isEmpty`, `uuidV4`, `resolveValue`, `jsonResponse`, `defineAuthController`) no longer exist under their old names, and `devz codemod namespace-functions` rewrites your calls to the class form.

## What changed

- **The old names are gone, with no alias.** Each function now lives as a static method of a class (for example `isEmpty({ value })` is `ObjectUtility.isEmpty({ value })`, `uuidV4()` is `UuidV4Generator.generate()`). One options object comes first; a function that already took one options object keeps its arguments.
- **One command moves your code.** `devz codemod namespace-functions` also moves `ApplicationLogger` to `LoggerFactory.getLogger([scope])` (see [the logger entry](/changelogs/2026-11-01-logger-factory-in-core)). It follows named, aliased and namespace imports of the `@venizia/*` packages, adds the class to the import and drops the old name once nothing uses it. It lists with file and line what it cannot rewrite safely.
- **A few removals have no codemod path** (see "Manual steps").

## Who is affected

- **Every app or package that imports one of the old names.** Run the codemod once after you upgrade.
- **An app that only uses decorators, `inject`, `getError`, the middleware DSL (`authenticate`, `authorize`), `field.*`, schema and column builders, mixins and hooks.** No action needed: those stay functions.

## Breaking changes

> [!WARNING]
> Code that imports an old function name fails to compile or to load after the upgrade.

**Before:**

```typescript
import { isEmpty, uuidV4 } from '@venizia/ignis-helpers';

if (!isEmpty({ value: payload })) {
  const id = uuidV4();
}
```

**After:**

```typescript
import { ObjectUtility, UuidV4Generator } from '@venizia/ignis-helpers';

if (!ObjectUtility.isEmpty({ value: payload })) {
  const id = UuidV4Generator.generate();
}
```

Upgrade steps:

1. Commit your work, so git can undo the codemod.
2. Dry run: `bunx devz codemod namespace-functions` lists every file and call it would change.
3. Apply: `bunx devz codemod namespace-functions --write`.
4. Run your formatter and `bun check`. Fix what the codemod listed as left (a spread argument, the old name used as a value, a re-export, a name collision, or an import it does not follow, such as a `@/...` alias).

## Manual steps

These removals cannot be migrated by the codemod:

- **MinIO is removed.** `MinioHelper`, `IMinioHelperOptions`, the `@venizia/ignis-helpers/minio` sub-path, the `minio` optional peer dependency and `StaticAssetStorageTypes.MINIO` (the `storage: 'minio'` option of static-asset) no longer exist. Use `BunS3Helper` from `@venizia/ignis-helpers/bun-s3`, which reaches a MinIO server over the same S3 API (set the endpoint and path-style addressing).
- **`StaticAssetDefinitions` is removed** (`@venizia/ignis`). Use `AssetDefinitionBuilder.build({})`.
- **`readAffectedRowCount` is removed** (`@venizia/ignis`), with no replacement: read `rows.length` of a returning statement, or the driver's own count on the raw result.

## Details

### @venizia/ignis-inversion (7)

| Old name | New form |
|---|---|
| `isEmpty` | `ObjectUtility.isEmpty` |
| `omit` | `ObjectUtility.omit` |
| `resolveValue` | `ResolverUtility.resolveValue` |
| `resolveValueAsync` | `ResolverUtility.resolveValueAsync` |
| `resolveInjectTarget` | `ResolverUtility.resolveInjectTarget` |
| `verifyBindings` | `BindingVerifier.verify` |
| `assertBindingsResolve` | `BindingVerifier.assertResolve` |

### @venizia/ignis-filter (2)

| Old name | New form |
|---|---|
| `parseOrderEntry` | `Sorts.parseEntry` |
| `buildQuerySchemas` | `QuerySchemaFactory.build` |

### @venizia/ignis-helpers (66)

| Old name | New form |
|---|---|
| `getPerformanceCheckpoint` | `PerformanceUtility.getCheckpoint` |
| `getExecutedPerformance` | `PerformanceUtility.getExecuted` |
| `executeWithPerformanceMeasure` | `PerformanceUtility.executeWithMeasure` |
| `hrTime` | `HrTimeUtility.getSeconds` |
| `parseMultipartBody` | `RequestUtility.parseMultipartBody` |
| `sanitizeFilename` | `RequestUtility.sanitizeFilename` |
| `encodeRFC5987` | `RequestUtility.encodeRfc5987` |
| `createContentDispositionHeader` | `RequestUtility.buildContentDispositionHeader` |
| `parseContentDisposition` | `RequestUtility.parseContentDisposition` |
| `readFormBody` | `FormBodyUtility.readFormBody` |
| `getUID` | `ParseUtility.getUID` |
| `toCamel` | `ParseUtility.toCamel` |
| `keysToCamel` | `ParseUtility.keysToCamel` |
| `isInt` | `ParseUtility.isInt` |
| `isFloat` | `ParseUtility.isFloat` |
| `int` | `ParseUtility.toInt` |
| `float` | `ParseUtility.toFloat` |
| `toBoolean` | `ParseUtility.toBoolean` |
| `parseArrayToMapWithKey` | `ParseUtility.parseArrayToMapWithKey` |
| `toDelimitedArray` | `ParseUtility.toDelimitedArray` |
| `blankToUndefined` | `ParseUtility.blankToUndefined` |
| `toTrimmed` | `ParseUtility.toTrimmed` |
| `getDeepProperty` | `ParseUtility.getDeepProperty` |
| `sleep` | `PromiseUtility.sleep` |
| `executePromiseWithLimit` | `PromiseUtility.executeWithLimit` |
| `voidExecution` | `PromiseUtility.voidExecution` |
| `toError` | `ErrorUtility.toError` |
| `isNotFoundError` | `StorageUtility.isNotFoundError` |
| `toExpirySeconds` | `StorageUtility.toExpirySeconds` |
| `createUuidV4` | `UuidV4Generator.create` |
| `uuidV4` | `UuidV4Generator.generate` |
| `createUuidV5` | `UuidV5Generator.create` |
| `uuidV5` | `UuidV5Generator.generate` |
| `createUuidV7` | `UuidV7Generator.create` |
| `uuidV7` | `UuidV7Generator.generate` |
| `redactSecrets` | `RedactUtility.redactSecrets` |
| `toJsonSafe` | `RedactUtility.toJsonSafe` |
| `redactUrlCredentials` | `RedactUtility.redactUrlCredentials` |
| `resolveClass` | `ClassResolver.resolveClass` |
| `createRedisHelper` | `RedisHelperFactory.create` |
| `createSecretsHelper` | `SecretsHelperFactory.create` |
| `waitForRedisReady` | `RedisUtility.waitForReady` |
| `ensureRedisClientsConnecting` | `RedisUtility.ensureConnecting` |
| `isUrlRefusedError` | `UrlPolicy.isRefusedError` |
| `toQueryString` | `QueryStringUtility.toQueryString` |
| `invokeHook` | `HookUtility.invoke` |
| `awaitHook` | `HookUtility.execute` |
| `resolveLoggerLevel` | `LoggerConfigUtility.resolveLevel` |
| `resolveLoggerColorize` | `LoggerConfigUtility.resolveColorize` |
| `formatLogMessage` | `LogFormatUtility.formatMessage` |
| `buildPinoOptions` | `PinoBackingLogger.buildOptions` |
| `getPinoBackingLogger` | `PinoBackingLogger.get` |
| `setPinoBackingLogger` | `PinoBackingLogger.set` |
| `mapFrequency` | `PinoDestination.mapFrequency` |
| `mapMaxFilesToCount` | `PinoDestination.mapMaxFilesToCount` |
| `resolveDestinationPlan` | `PinoDestination.resolvePlan` |
| `buildDestination` | `PinoDestination.build` |
| `defineCustomLogger` | `WinstonLoggerFactory.defineCustomLogger` |
| `defineJsonLoggerFormatter` | `WinstonFormatFactory.json` |
| `defineLogFormatter` | `WinstonFormatFactory.log` |
| `definePrettyLoggerFormatter` | `WinstonFormatFactory.pretty` |
| `resolveDefaultTransportOptions` | `WinstonLoggerFactory.resolveDefaultTransportOptions` |
| `deepSplat` | `WinstonFormatFactory.deepSplat` |
| `platformaticRequirePlugin` | `PlatformaticKafkaPlugins.buildRequirePlugin` |
| `platformaticWasmPlugin` | `PlatformaticKafkaPlugins.buildWasmPlugin` |
| `platformaticKafkaPlugins` | `PlatformaticKafkaPlugins.build` |

### @venizia/ignis-boot (2)

| Old name | New form |
|---|---|
| `generateArtifactIndex` | `ArtifactIndexGenerator.generate` |
| `checkArtifactIndex` | `ArtifactIndexGenerator.check` |

### @venizia/ignis-kernel (25)

| Old name | New form |
|---|---|
| `htmlContent` | `OpenApiResponses.htmlContent` |
| `htmlResponse` | `OpenApiResponses.htmlResponse` |
| `jsonContent` | `OpenApiResponses.jsonContent` |
| `errorResponses` | `OpenApiResponses.errorResponses` |
| `jsonResponse` | `OpenApiResponses.jsonResponse` |
| `requiredString` | `OpenApiSchemas.requiredString` |
| `idParamsSchema` | `OpenApiSchemas.idParams` |
| `asTypedContext` | `ContextUtility.asTypedContext` |
| `registerFactoryRepositoryInjection` | `ControllerFactory.registerRepositoryInjection` |
| `toContentRange` | `DataRangeUtility.toContentRange` |
| `buildDataRange` | `DataRangeUtility.buildDataRange` |
| `toEntityId` | `ModelUtility.toEntityId` |
| `snakeToCamel` | `ModelUtility.snakeToCamel` |
| `readDeclarative` | `RequestDomainResolver.readDeclarative` |
| `resolveRequestDomain` | `RequestDomainResolver.resolveRequestDomain` |
| `pickRegistrationOptions` | `InjectableUtility.pickRegistrationOptions` |
| `emojiFavicon` | `EmojiFaviconMiddleware.create` |
| `throwNotSupported` | `NotSupportedUtility.throwNotSupported` |
| `conditionalCountResponse` | `RouteConfigResolver.conditionalCountResponse` |
| `resolveCountConfig` | `RouteConfigResolver.resolveCountConfig` |
| `resolveFindConfig` | `RouteConfigResolver.resolveFindConfig` |
| `resolveFindByIdConfig` | `RouteConfigResolver.resolveFindByIdConfig` |
| `resolveFindOneConfig` | `RouteConfigResolver.resolveFindOneConfig` |
| `resolveCreateConfig` | `RouteConfigResolver.resolveCreateConfig` |
| `defineControllerRouteConfigs` | `RouteConfigResolver.defineControllerRouteConfigs` |

### @venizia/ignis-connectors (38)

| Old name | New form |
|---|---|
| `generateDataTypeColumnDefs` | `PostgresDataTypeEnricher.generateColumnDefs` |
| `enrichDataTypes` | `PostgresDataTypeEnricher.enrich` |
| `generateIdColumnDefs` | `PostgresIdEnricher.generateColumnDefs` |
| `enrichId` | `PostgresIdEnricher.enrich` |
| `generatePrincipalColumnDefs` | `PostgresPrincipalEnricher.generateColumnDefs` |
| `enrichPrincipal` | `PostgresPrincipalEnricher.enrich` |
| `generateTzColumnDefs` | `PostgresTzEnricher.generateColumnDefs` |
| `enrichTz` | `PostgresTzEnricher.enrich` |
| `generateUserAuditColumnDefs` | `PostgresUserAuditEnricher.generateColumnDefs` |
| `enrichUserAudit` | `PostgresUserAuditEnricher.enrich` |
| `generateDataTypeColumnDefs` | `SqliteDataTypeEnricher.generateColumnDefs` |
| `enrichDataTypes` | `SqliteDataTypeEnricher.enrich` |
| `generateIdColumnDefs` | `SqliteIdEnricher.generateColumnDefs` |
| `enrichId` | `SqliteIdEnricher.enrich` |
| `generatePrincipalColumnDefs` | `SqlitePrincipalEnricher.generateColumnDefs` |
| `enrichPrincipal` | `SqlitePrincipalEnricher.enrich` |
| `generateTzColumnDefs` | `SqliteTzEnricher.generateColumnDefs` |
| `enrichTz` | `SqliteTzEnricher.enrich` |
| `generateUserAuditColumnDefs` | `SqliteUserAuditEnricher.generateColumnDefs` |
| `enrichUserAudit` | `SqliteUserAuditEnricher.enrich` |
| `assertScopeFilterSupported` | `ScopeFilterUtility.assertScopeFilterSupported` |
| `getIdType` | `RelationalEntityUtility.getIdType` |
| `resolveAuditUserId` | `AuditUserResolver.resolveAuditUserId` |
| `toRelationConfigs` | `RelationDeclarations.toRelationConfigs` |
| `getCachedColumns` | `TableColumnCache.get` |
| `isJsonPath` | `JsonPathUtility.isJsonPath` |
| `parseJsonPath` | `JsonPathUtility.parseJsonPath` |
| `validateJsonPathComponents` | `JsonPathUtility.validateJsonPathComponents` |
| `validateJsonColumnType` | `JsonPathUtility.validateJsonColumnType` |
| `createRelations` | `RelationsFactory.create` |
| `buildPostgresJsOptions` | `SupabasePooler.buildPostgresJsOptions` |
| `withAuthContext` | `SupabaseRls.withAuthContext` |
| `defineSearchRouteConfigs` | `SearchControllerFactory.defineRouteConfigs` |
| `defineSearchCollection` | `SearchCollectionFactory.define` |
| `deriveSearchDocumentSchema` | `SearchCollectionFactory.deriveDocumentSchema` |
| `toSearchQueryParams` | `SearchQueryParamsUtility.toSearchQueryParams` |
| `compileMeilisearchCollection` | `MeilisearchCollectionCompiler.compile` |
| `compileTypesenseCollection` | `TypesenseCollectionCompiler.compile` |

### @venizia/ignis-worker (1)

| Old name | New form |
|---|---|
| `installBffFetch` | `BffFetchBridge.install` |

### @venizia/ignis (20)

| Old name | New form |
|---|---|
| `readRuntimeSnapshot` | `BunRuntimeGuard.readSnapshot` |
| `assertBunRuntime` | `BunRuntimeGuard.assert` |
| `defineAuthController` | `AuthControllerFactory.define` |
| `extraUserColumns` | `AuthModelColumns.buildUser` |
| `extraRoleColumns` | `AuthModelColumns.buildRole` |
| `extraPermissionColumns` | `AuthModelColumns.buildPermission` |
| `extraPolicyDefinitionColumns` | `AuthModelColumns.buildPolicyDefinition` |
| `policyDefinitionDomainShapeCheck` | `AuthModelColumns.buildPolicyDefinitionDomainShapeCheck` |
| `splitAddressList` | `MailAddressUtility.splitList` |
| `formatAddressHeader` | `MailMimeUtility.formatAddressHeader` |
| `buildRawMimeMessage` | `MailMimeUtility.buildRawMessage` |
| `getExpiryTime` | `MailVerificationUtility.getExpiryTime` |
| `getExpiryTimeInHours` | `MailVerificationUtility.getExpiryTimeInHours` |
| `buildCommitToken` | `AssetCommitToken.build` |
| `readCommitToken` | `AssetCommitToken.read` |
| `findLabelsInQuery` | `AssetControllerFactory.findLabelsInQuery` |
| `buildObjectLink` | `AssetControllerFactory.buildObjectLink` |
| `resolveServedContentType` | `AssetControllerFactory.resolveServedContentType` |
| `assertApplicationBoots` | `ApplicationBootAssertion.assert` |
| `readResultRows` | `DrizzleResultUtility.readResultRows` |

### @venizia/dev-configs (23)

| Old name | New form |
|---|---|
| `findCatalogProblems` | `CatalogCheck.find` |
| `runModuleCycles` | `ModuleCyclesCheck.run` |
| `assertNoWorkspaceExternal` | `PurityManifest.assertNoWorkspaceExternal` |
| `deriveEntries` | `PurityManifest.deriveEntries` |
| `assertBrowserEsmEntry` | `PurityManifest.assertBrowserEsmEntry` |
| `buildManifest` | `PurityManifest.build` |
| `stripBundlerPathComments` | `PurityProbe.stripBundlerPathComments` |
| `probeEntry` | `PurityProbe.probeEntry` |
| `checkPurity` | `PurityCheck.run` |
| `listTestTitles` | `TestControlsCheck.listTitles` |
| `checkControls` | `TestControlsCheck.run` |
| `findDeadTestCode` | `DeadTestCodeCheck.find` |
| `replayLedger` | `TestMutateCheck.replayLedger` |
| `formatLedgerResults` | `TestMutateCheck.formatLedgerResults` |
| `analyseJunit` | `TestWeightCheck.analyseJunit` |
| `formatTestWeight` | `TestWeightCheck.formatReport` |
| `rejectionOf` | `RejectionHelper.rejectionOf` |
| `expectRejection` | `RejectionHelper.expectRejection` |
| `findRepositoryRoot` | `RepoTmp.findRoot` |
| `useRepoTmp` | `RepoTmp.apply` |
| `spawnSyncBounded` | `SpawnHelper.spawnSyncBounded` |
| `readField` | `AstNode.readField` |
| `nodeType` | `AstNode.getType` |


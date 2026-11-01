---
title: The old function names are removed, and one codemod moves your calls
description: 'Every public function that moved into a class loses its old name in this release; devz codemod namespace-functions rewrites the calls, and a short list of removals (MinIO, a few helpers) needs a manual step.'
packages: ['@venizia/ignis-inversion', '@venizia/ignis-filter', '@venizia/ignis-helpers', '@venizia/ignis-boot', '@venizia/ignis-kernel', '@venizia/ignis-connectors', '@venizia/ignis-worker', '@venizia/ignis', '@venizia/dev-configs']
---

# Changelog - 2026-11-01

## The old function names are removed, and one codemod moves your calls

<Badge type="warning" text="Breaking Change" />

**In one line.** Run `devz codemod namespace-functions` to rewrite your calls, because 184 public functions (such as `isEmpty`, `uuidV4`, `resolveValue`, `jsonResponse`, `defineAuthController`) no longer exist as standalone functions and now live in classes.

## What changed

- **Update your calls to static methods.** Standalone function names are gone, and IGNIS provides no aliases. Call each function as a static method on its new class (for example, call `ObjectUtility.isEmpty({ value })` instead of `isEmpty({ value })`, and call `UuidV4Generator.generate()` instead of `uuidV4()`). Pass an options object first. Keep the arguments as they were if the function already accepted one options object.
- **Run one command to rewrite your code.** Run `devz codemod namespace-functions` to update imports and call sites across your project. This command also rewrites `ApplicationLogger` to `LoggerFactory.getLogger([scope])` (see [the logger entry](/changelogs/2026-11-01-logger-factory-in-core)). The codemod tracks named, aliased, and namespace imports from `@venizia/*` packages. It adds the new class to your imports. It removes the old function name once no code uses it. It outputs the file name and line number for any code that it cannot safely rewrite.
- **Migrate unsupported removals by hand.** Check "Manual steps" for changes that the codemod does not handle.

## Who is affected

- **Apps and packages that import old function names.** Run the codemod once after you install this IGNIS upgrade.
- **Apps that use only decorators, `inject`, `getError`, the middleware DSL (`authenticate`, `authorize`), `field.*`, schema and column builders, mixins, and hooks.** Take no action. These APIs remain functions.

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

- **Switch from MinIO to BunS3Helper.** MinIO support is removed from IGNIS. Do not use `MinioHelper`, `IMinioHelperOptions`, the `@venizia/ignis-helpers/minio` sub-path, the `minio` optional peer dependency, or `StaticAssetStorageTypes.MINIO` (the `storage: 'minio'` option of static-asset). Import `BunS3Helper` from `@venizia/ignis-helpers/bun-s3` instead. Connect to your MinIO server through the S3 API by configuring the custom endpoint and path-style addressing.
- **Replace `StaticAssetDefinitions`.** `StaticAssetDefinitions` is removed from `@venizia/ignis`. Call `AssetDefinitionBuilder.build({})` instead.
- **Remove `readAffectedRowCount`.** `readAffectedRowCount` is removed from `@venizia/ignis` without a replacement. Read `rows.length` from a returning statement instead, or read the affected row count directly from the database driver raw result.

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


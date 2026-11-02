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

- **Update your calls to static methods.** Standalone function names are gone, and IGNIS provides no aliases. Call each function as a static method on its new class (for example, call `ObjectUtility.isEmpty({ value })` instead of `isEmpty({ value })`, and call `UuidV4Generator.generate()` instead of `uuidV4()`). Pass an options object first: 39 of the old functions took positional arguments, and [the list](#calls-that-take-an-options-object-now) shows each new call. Keep the arguments as they were if the function took none or already accepted one options object.
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

1. Commit your work, so git can undo the codemod. With `--write` the codemod refuses a file that has local changes (modified, staged or untracked) and prints `refused <file> has local changes`; commit or stash it and run again.
2. Dry run: `bunx devz codemod namespace-functions` lists every file and call it would change.
3. Apply: `bunx devz codemod namespace-functions --write`.
4. Run your formatter and `bun check`. Fix what the codemod listed as left (a spread argument, the old name used as a value, a re-export, a name collision, or an import it does not follow, such as a `@/...` alias).

## Manual steps

These removals cannot be migrated by the codemod. A removed name that was never exported from a package entry, such as `StaticAssetDefinitions` (an internal constant of the static-asset controller), needs no step.

- **Switch from MinIO to BunS3Helper.** MinIO support is removed from IGNIS. Do not use `MinioHelper`, `IMinioHelperOptions`, the `@venizia/ignis-helpers/minio` sub-path, the `minio` optional peer dependency, or `StaticAssetStorageTypes.MINIO` (the `storage: 'minio'` option of static-asset). Import `BunS3Helper` from `@venizia/ignis-helpers/bun-s3` instead. Connect to your MinIO server through the S3 API by configuring the custom endpoint and path-style addressing.
- **Remove `readAffectedRowCount`.** `readAffectedRowCount` is removed from `@venizia/ignis` without a replacement. Read `rows.length` from a returning statement instead, or read the affected row count directly from the database driver raw result.

## Details

### Calls that take an options object now

The codemod rewrites these calls for you. If you migrate by hand, note that the old function took positional arguments and its replacement takes one options object whose keys are the old parameter names. A parameter written with `?` is optional; leave its key out when the old call left it out. Every other function in the tables below took no arguments or one options object already, and keeps its call shape.

**@venizia/ignis-helpers** (20)

| Old call | New call |
|---|---|
| `sanitizeFilename(filename)` | `RequestUtility.sanitizeFilename({ filename })` |
| `encodeRFC5987(filename)` | `RequestUtility.encodeRfc5987({ filename })` |
| `toCamel(input)` | `ParseUtility.toCamel({ input })` |
| `keysToCamel(source)` | `ParseUtility.keysToCamel({ source })` |
| `isInt(input)` | `ParseUtility.isInt({ input })` |
| `isFloat(input)` | `ParseUtility.isFloat({ input })` |
| `int(input)` | `ParseUtility.toInt({ input })` |
| `float(input, digit?)` | `ParseUtility.toFloat({ input, digit })` |
| `toBoolean(input)` | `ParseUtility.toBoolean({ input })` |
| `parseArrayToMapWithKey(items, key)` | `ParseUtility.parseArrayToMapWithKey({ items, key })` |
| `toDelimitedArray(input, separator?)` | `ParseUtility.toDelimitedArray({ input, separator })` |
| `blankToUndefined(input)` | `ParseUtility.blankToUndefined({ input })` |
| `toTrimmed(input)` | `ParseUtility.toTrimmed({ input })` |
| `getDeepProperty(source, path)` | `ParseUtility.getDeepProperty({ source, path })` |
| `sleep(ms)` | `PromiseUtility.sleep({ ms })` |
| `toError(error)` | `ErrorUtility.toError({ error })` |
| `redactSecrets(value, seen?, depth?)` | `RedactUtility.redactSecrets({ value, seen, depth })` |
| `redactUrlCredentials(url)` | `RedactUtility.redactUrlCredentials({ url })` |
| `mapFrequency(value?)` | `PinoDestination.mapFrequency({ value })` |
| `buildDestination(plan)` | `PinoDestination.build({ plan })` |

**@venizia/ignis-connectors** (6)

| Old call | New call |
|---|---|
| `enrichDataTypes(baseSchema, opts?)` | `PostgresDataTypeEnricher.enrich({ baseSchema, opts })` or `SqliteDataTypeEnricher.enrich({ baseSchema, opts })` |
| `enrichId(baseColumns, opts?)` | `PostgresIdEnricher.enrich({ baseColumns, opts })` or `SqliteIdEnricher.enrich({ baseColumns, opts })` |
| `enrichPrincipal(baseSchema, opts)` | `PostgresPrincipalEnricher.enrich({ baseSchema, opts })` or `SqlitePrincipalEnricher.enrich({ baseSchema, opts })` |
| `enrichTz(baseSchema, opts?)` | `PostgresTzEnricher.enrich({ baseSchema, opts })` or `SqliteTzEnricher.enrich({ baseSchema, opts })` |
| `enrichUserAudit(baseSchema, opts?)` | `PostgresUserAuditEnricher.enrich({ baseSchema, opts })` or `SqliteUserAuditEnricher.enrich({ baseSchema, opts })` |
| `toSearchQueryParams(input)` | `SearchQueryParamsUtility.toSearchQueryParams({ input })` |

**@venizia/ignis-kernel** (2)

| Old call | New call |
|---|---|
| `asTypedContext(context)` | `ContextUtility.asTypedContext({ context })` |
| `snakeToCamel(shape)` | `ModelUtility.snakeToCamel({ shape })` |

**@venizia/ignis** (6)

| Old call | New call |
|---|---|
| `splitAddressList(value)` | `MailAddressUtility.splitList({ value })` |
| `formatAddressHeader(value)` | `MailMimeUtility.formatAddressHeader({ value })` |
| `buildRawMimeMessage(message)` | `MailMimeUtility.buildRawMessage({ message })` |
| `getExpiryTime(minutes)` | `MailVerificationUtility.getExpiryTime({ minutes })` |
| `getExpiryTimeInHours(hours)` | `MailVerificationUtility.getExpiryTimeInHours({ hours })` |
| `assertApplicationBoots(application, options?)` | `ApplicationBootAssertion.assert({ application, options })` |

**@venizia/dev-configs** (5)

| Old call | New call |
|---|---|
| `assertNoWorkspaceExternal(manifest, workspaceScope?)` | `PurityManifest.assertNoWorkspaceExternal({ manifest, workspaceScope })` |
| `stripBundlerPathComments(text)` | `PurityProbe.stripBundlerPathComments({ text })` |
| `formatLedgerResults(results)` | `TestMutateCheck.formatLedgerResults({ results })` |
| `rejectionOf(task)` | `RejectionHelper.rejectionOf({ task })` |
| `findRepositoryRoot(start?)` | `RepoTmp.findRoot({ start })` |

For the five `enrich*` functions the class depends on the dialect: use the `Postgres...` class for a Postgres model and the `Sqlite...` class for a SQLite model.

### Message text that changed with the names

An error or log message that began with the old function name now begins with the class and method. Code, tests and alerts that match the text stop matching. These are the tags found by comparing the 0.4.6 sources with this release; a message that still carries an old function name was not renamed.

| Old tag | New tag |
|---|---|
| `[toEntityId]` | `[ModelUtility.toEntityId]` |
| `[idParamsSchema]` | `[OpenApiSchemas.idParams]` |
| `[extraPermissionColumns]` | `[AuthModelColumns.buildPermission]` |
| `[extraPolicyDefinitionColumns]` | `[AuthModelColumns.buildPolicyDefinition]` |
| `[releaseAttachmentStreams]` | `[MailAttachmentUtility.release]` |
| `[createRedisHelper]` | `[RedisHelperFactory.create]` |
| `[assertApplicationBoots]` | `[ApplicationBootAssertion.assert]` |
| `[readResultRows]` | `[DrizzleResultUtility.readResultRows]` |
| `[defineControllerRouteConfigs]` | `[RouteConfigResolver.defineControllerRouteConfigs]` |
| `[spawnSyncBounded]` | `[SpawnHelper.spawnSyncBounded]` |

The `BaseSearchEntity` message that said to define a static schema "via defineSearchCollection" now says "via SearchCollectionFactory.define".

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


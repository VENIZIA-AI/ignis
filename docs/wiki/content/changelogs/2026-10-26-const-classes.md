---
title: String Options Are Const Classes, and dev-configs Warns on String-Literal Unions and Casts
description: "String options across the IGNIS packages are now const classes with SCHEME_SET and isValid with unchanged values, and ESLint now warns on a string-literal union in an exported type and on an as X cast."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-helpers', '@venizia/ignis-kernel', '@venizia/ignis-connectors', '@venizia/ignis', '@venizia/dev-configs']
---

# Changelog - 2026-10-26

## String options are const classes, and dev-configs warns on string-literal unions and casts

<Badge type="tip" text="Enhancement" /> <Badge type="info" text="Behavior Change" />

**In one line.** Options typed as a union of string literals are now a const class plus a `TConstValue` type, like `RepositoryTypes`, and `@venizia/dev-configs` warns when you write such a union or an `as X` cast yourself. The values and defaults are the same, so existing code keeps compiling and no lint fails.

## What changed

- **Each class has `SCHEME_SET` and `isValid(value)`**, so a value read from config or a request can be checked at runtime.
- **The literal still works.** `{ from: 'header', key: 'x-m', type: 'Merchant' }`, `{ type: 'strings' }`, `{ numberMode: 'bigint' }` and `EqeqeqRule.build({ mode: 'always' })` compile as before; so does the class value (`AuthorizationDomainSources.HEADER`, `BigIntModes.BIGINT`).
- **The id-type options use `TIdSchemaType`** (`number` or `string`) from the kernel package: `polymorphicIdType` and the `IdType` generics of `enrichPrincipal` and `generatePrincipalColumnDefs`, the `dataType` of the user-audit enricher, and the id-type options of the server models (`extraUserColumns`, the permission and policy-definition options). `TIdSchemaType` is now `TConstValue<typeof IdSchemaTypes>`.
- **`TJWKSAlgorithm` and `TIdSchemaType` moved files**, not names: both are exported from the same package entries as before.
- **`TConstValue<T>` is exported** from the dev-configs rules entry.

| Package | Option | Const class | Type |
|---|---|---|---|
| kernel | `ICompressOptions.encoding` | `CompressEncodings` | `TCompressEncoding` |
| kernel | `IJWKSIssuerOptions.algorithm` | `JWKSAlgorithms` | `TJWKSAlgorithm` |
| kernel | `IAuthorizationDomainSource.from` | `AuthorizationDomainSources` | `TAuthorizationDomainSource` |
| kernel | `registerRoutesFromRegistry({ paths })` | `RoutePathScopes` | `TRoutePathScope` |
| kernel | `AbstractEntity.getIdType()` | `IdSchemaTypes` | `TIdSchemaType` |
| kernel | `getAuthorizeModelPrincipals({ format })`, `getAuthorizeModelSettings({ format })` | `AuthorizeModelFormats` | `TAuthorizeModelFormat` |
| connectors | HTTP `read({ shape })` | `HttpReadShapes` | `THttpReadShape` |
| connectors | Scope write guard `operation` | `ScopeWriteOperations` | `TScopeWriteOperation` |
| connectors | `big-number` id `numberMode` (Postgres) | `BigIntModes` | `TBigIntMode` |
| inversion | `ApplicationError` `logLevel` | `ErrorLogLevels` | `TErrorLogLevel` |
| helpers | High-frequency logger level | `LogLevels` (already existed) | `THfLogLevel` |
| helpers | `IFieldMapping.type` | `FieldMappingDataTypes` | `TFieldMappingDataType` |
| helpers | `AES` cipher | `AESAlgorithms` | `AESAlgorithmType` |
| helpers | pino file roll frequency | `PinoFrequencies` | `TFrequency` |
| helpers | Fetcher client | `FetcherVariants` | `TFetcherVariant` |
| helpers | BullMQ helper role | `BullQueueRoles` | `TBullQueueRole` |
| helpers | TCP client state | `TcpClientStates` | `TTcpClientState` |
| helpers | Kafka consumer, why every broker is gone | `KafkaBrokersDownReasons` | `TKafkaBrokersDownReason` |
| helpers | `createContentDispositionHeader({ type })` | `ContentDispositionTypes` | `TContentDispositionType` |
| helpers | `parseMultipartBody({ storage })`, static-asset upload `storage` | `MultipartStorages` | `TMultipartStorage` |
| helpers | Locale month and weekday name width | `TemporalNameWidths` | `TTemporalNameWidth` |
| helpers | Locale `writtenDate` style | `TemporalWrittenDateStyles` | `TTemporalWrittenDateStyle` |
| helpers | Pattern dialect tokens | `PatternTokens` | `TPatternToken`, `TWriteOnlyToken` |
| server | Mail queue `backoff.type` | `MailBackoffTypes` | `TMailBackoffType` |
| dev-configs | `severity` of every rule builder | `RuleSeverities` | `TRuleSeverity` |
| dev-configs | `EqeqeqRule.build({ mode })` | `EqeqeqModes` | `TEqeqeqMode` |
| dev-configs | `NoUnusedVarsRule.build({ vars })` | `UnusedVarsScopes` | `TUnusedVarsScope` |
| dev-configs | `NoUnusedVarsRule.build({ args })` | `UnusedArgsModes` | `TUnusedArgsMode` |
| dev-configs | `SwitchCaseBracesRule.build({ mode })` | `SwitchCaseBracesModes` | `TSwitchCaseBracesMode` |

### New lint warnings

After updating `@venizia/dev-configs`, `houseConfigs` and `reactHouseConfigs` print warnings that never fail the lint. Tests are exempt.

```text
warning  An enumerable string is a const class plus TConstValue<typeof X>, not a union of string literals  venizia/const-class-values
warning  Do not use any type assertions  @typescript-eslint/consistent-type-assertions
```

- **`venizia/const-class-values` is on, at `warn`.** It used to be off and checked only exported types named `*State`, `*Status`, `*Stage`, `*Mode`, `*Kind` or `*Type`. It now checks every exported declaration: a type alias, an interface member, a generic constraint, a parameter or a return type. Fix a hit with a const class and `TConstValue`.
- **Key sets are skipped.** `Pick<T, 'a' | 'b'>`, `Omit`, `Extract`, `Exclude`, `Record` and mapped-type keys are not value domains, and a union with a non-string member is not either.
- **`@typescript-eslint/consistent-type-assertions` is on, at `warn`, with `assertionStyle: 'never'`.** `as X`, `as any` and `as unknown as X` warn. `as const` and `satisfies` do not.
- **`ConstClassValuesRule.build({ namePattern })` is optional.** Without it the rule checks every exported declaration. Pass `namePattern` to keep the old narrow behavior.

## Who is affected

Nobody has to change code. Prefer the class value in new code: `RoutePathScopes.PARAM` over `'param'`. Apps and libraries that lint with `houseConfigs` or `reactHouseConfigs` see new warnings. To stay quiet, turn a rule off after the preset; to make one a failure, set it to `'error'` the same way:

```javascript
import { houseConfigs } from '@venizia/dev-configs/linters';

export default [
  ...houseConfigs,
  { rules: { 'venizia/const-class-values': 'off', '@typescript-eslint/consistent-type-assertions': 'off' } },
];
```

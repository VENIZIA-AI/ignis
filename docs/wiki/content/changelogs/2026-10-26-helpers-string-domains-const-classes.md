---
title: Helpers, Inversion and Server String Options Are Const Classes
description: 'Fourteen string options in the inversion, helpers and server packages - error log level, field mapping type, AES algorithm, pattern tokens, TCP client state and more - are const classes with SCHEME_SET and isValid. The values are unchanged.'
packages: ['@venizia/ignis-inversion', '@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-10-26

## Helpers, inversion and server string options are const classes

<Badge type="tip" text="Enhancement" />

**In one line.** Options typed as a union of string literals are now a const class plus a `TConstValue` type, like `RepositoryTypes`. The values are the same, so existing code keeps compiling.

| Option                                                           | Const class                   | Type                               | Values                                              |
| ---------------------------------------------------------------- | ----------------------------- | ---------------------------------- | --------------------------------------------------- |
| `ApplicationError` `logLevel` (inversion)                        | `ErrorLogLevels`              | `TErrorLogLevel`                   | `error`, `emerg`, `warn`, `info`, `debug`           |
| High-frequency logger level                                      | `LogLevels` (already existed) | `THfLogLevel`                      | same five                                           |
| `IFieldMapping.type`                                             | `FieldMappingDataTypes`       | `TFieldMappingDataType`            | `string`, `number`, `strings`, `numbers`, `boolean` |
| `AES` cipher                                                     | `AESAlgorithms`               | `AESAlgorithmType`                 | `aes-256-cbc`, `aes-256-gcm`                        |
| pino file roll frequency                                         | `PinoFrequencies`             | `TFrequency`                       | `hourly`, `daily`                                   |
| Fetcher client                                                   | `FetcherVariants`             | `TFetcherVariant`                  | `node-fetch`, `axios`                               |
| BullMQ helper role                                               | `BullQueueRoles`              | `TBullQueueRole`                   | `queue`, `worker`                                   |
| TCP client state                                                 | `TcpClientStates`             | `TTcpClientState`                  | `unauthorized`, `authenticating`, `authenticated`   |
| Kafka consumer, why every broker is gone                         | `KafkaBrokersDownReasons`     | `TKafkaBrokersDownReason`          | `disconnected`, `failed`                            |
| `createContentDispositionHeader({ type })`                       | `ContentDispositionTypes`     | `TContentDispositionType`          | `attachment`, `inline`                              |
| `parseMultipartBody({ storage })`, static-asset upload `storage` | `MultipartStorages`           | `TMultipartStorage`                | `memory`, `disk`                                    |
| Locale month and weekday name width                              | `TemporalNameWidths`          | `TTemporalNameWidth`               | `narrow`, `short`, `long` (months: `short`, `long`) |
| Locale `writtenDate` style                                       | `TemporalWrittenDateStyles`   | `TTemporalWrittenDateStyle`        | `numeric`, `long`                                   |
| Pattern dialect tokens                                           | `PatternTokens`               | `TPatternToken`, `TWriteOnlyToken` | the 27 tokens, 12 of them write-only                |
| Mail queue `backoff.type` (server)                               | `MailBackoffTypes`            | `TMailBackoffType`                 | `fixed`, `exponential`                              |

## What changed

- **Each class has `SCHEME_SET` and `isValid(value)`.**
- **The literal still works.** `{ type: 'strings' }`, `{ storage: 'disk' }` and `'MMMM'` compile as before; so does the class value (`PatternTokens.MONTH_NAME_LONG`).
- **`TemporalTokens.WRITE_ONLY_TOKENS` is built from `PatternTokens.WRITE_ONLY_SET`;** the type is unchanged.
- **The id-type options of the server models** (`extraUserColumns`, the permission and policy-definition options) use the kernel's `TIdSchemaType`.

## Who is affected

Nobody has to change code. Prefer the class value in new code.

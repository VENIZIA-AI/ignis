---
title: Dates Move Out, and Every Entry Loads On Its Own
description: "The 0.2.0-48 prerelease: the dayjs date utility gives way to TemporalHelper, search controllers and RecursiveTreeSql move to their own entries, compiled binaries get a typed module option, Node ESM works, and a clean-install gate proves every sub-path loads."
---

# Changelog - 2026-09-19

One batch, so an application migrates once. It ships in `@venizia/ignis` 0.2.0-48 and the packages released with it.

## Migration checklist

| If your code... | Do this |
|---|---|
| imports `dayjs` from `@venizia/ignis-helpers` | Install dayjs and configure it yourself, or move to `TemporalHelper` - see [Replace the dayjs IGNIS used to export](/extensions/helpers/temporal/#replace-the-dayjs-ignis-used-to-export) |
| calls `isWeekday`, `getNextWeekday`, `getPreviousWeekday` or `getDateTz` | Use `TemporalHelper` - the same page maps each one |
| relies on IGNIS setting `dayjs.tz` default to `APP_ENV_APPLICATION_TIMEZONE` | Call `dayjs.tz.setDefault(...)` yourself, or pass `timeZone` to `TemporalHelper` |
| imports `dayjs` without declaring it | `bun add dayjs` - IGNIS no longer installs it |
| reads `storage.connectedAt` or `storage.authenticatedAt` on a TCP server client | They are `Date` now, not dayjs objects |
| imports a search controller from `@venizia/ignis-connectors`, `/search`, `/typesense`, `@venizia/ignis/search` or `@venizia/ignis/typesense` | Import it from `/search/controllers` or `/typesense/controllers` |
| imports `RecursiveTreeSql` or its types from `@venizia/ignis-kernel` | Import them from `@venizia/ignis` or `@venizia/ignis-connectors` |
| reads `schemaFactory` on an entity class, or `.schema` off `typeof BaseEntity` | Call `getSchema({ type })`; read `schema` off the concrete class or the instance |
| passes `uuidV5` a name that may hold a lone surrogate | Expect a 400, or clean the string first |
| runs a `bun build --compile` binary that uses Redis, BullMQ or the socket.io client | Pass the peer as `module`, or register it at the entrypoint - see [Compiled binaries](#compiled-binaries-get-a-typed-module-option) |

## Breaking changes

### The date utility is gone

<Badge type="danger" text="Breaking" />

`@venizia/ignis-helpers` no longer exports `dayjs`, `isWeekday`, `getPreviousWeekday`, `getNextWeekday` or `getDateTz`. It no longer sets `dayjs.tz`'s default zone when it loads, and `dayjs` is no longer one of its dependencies. `sleep` and `hrTime` stay, unchanged. Measured on one consumer monorepo: 19 files import `dayjs` or `getDateTz` from `@venizia/ignis-helpers`.

**Keep dayjs.** Install it and configure it once, with the plugins you rely on. IGNIS extended `customParseFormat`, `utc`, `timezone`, `weekday` and `isoWeek`, and set the default zone to `APP_ENV_APPLICATION_TIMEZONE` or `Asia/Ho_Chi_Minh`.

> [!WARNING]
> Keep `customParseFormat`. Without it, `dayjs(value, format)` ignores the format, and some formats then parse to the wrong date without an error. `dayjs('09/10/2026', 'DD/MM/YYYY')` reads as 10 September instead of 9 October, and `dayjs('260919', 'YYMMDD')` lands in the year 2610. A compact `YYYYMMDDHHmmss` value still parses correctly - the risk is day-first and two-digit-year formats.

**Or move to `TemporalHelper`.** It parses, formats and moves dates in a time zone you name, through the date library you pass in. See [Temporal](/extensions/helpers/temporal/).

```typescript
import { TemporalHelper } from '@venizia/ignis-helpers/temporal';

const temporal = new TemporalHelper({ timeZone: 'Asia/Ho_Chi_Minh' });

temporal.parse({ value: '20260919120000', pattern: 'YYYYMMDDHHmmss' }); // 2026-09-19T05:00:00.000Z
temporal.nextWeekday({ value: new Date() }); // next Monday to Friday, in Ho Chi Minh City
```

`APP_ENV_APPLICATION_TIMEZONE` now feeds only the startup banner.

### TCP client timestamps are `Date`

<Badge type="danger" text="Breaking" />

A TCP server's `client.storage.connectedAt` and `authenticatedAt` are a `Date` and a `Date | null`. They were dayjs objects. Replace `.format(...)`, `.diff(...)` and the like with `Date` methods, or with `TemporalHelper`.

### Search controllers live on their own entry

<Badge type="danger" text="Breaking" />

`@venizia/ignis-connectors/search` and `/typesense` load without `hono` or `drizzle-orm` now, so they no longer carry the controllers. Neither do the package root `@venizia/ignis-connectors`, nor the `@venizia/ignis/search` and `@venizia/ignis/typesense` aliases.

```typescript
// Before
import { SearchControllerFactory } from '@venizia/ignis/typesense';

// After
import { SearchControllerFactory } from '@venizia/ignis/typesense/controllers';
```

Affected names: `AbstractSearchController`, `SearchControllerFactory`, `defineSearchRouteConfigs`, `ISearchControllerOptions`, `ISearchCustomizableRoutes`. They come from `/search/controllers` or `/typesense/controllers`, on either package.

### `RecursiveTreeSql` moved from the kernel to connectors

<Badge type="danger" text="Breaking" />

`RecursiveTreeSql`, `RecursiveTreeDirections`, `IRecursiveTreeOptions` and `TRecursiveTreeDirection` value-import `drizzle-orm`, which the kernel reaches through types only. They are gone from `@venizia/ignis-kernel`. `@venizia/ignis` still exports them from its root, and `@venizia/ignis-connectors` exports them from its root, `./relational`, `./postgres` and `./sqlite`.

### The entity base class loosened two statics

<Badge type="danger" text="Breaking" />

Needed by `defineEntity`. Most models are untouched.

- **`BaseRelationalEntity.schema` (static) is typed `Table`.** A subclass that assigns `static override schema = someTable` keeps its precise type. Code that read `.schema.id` off the base class type (`typeof BaseEntity`) reads it off the concrete class or the instance.
- **The protected static `schemaFactory` getter is gone.** A subclass that called it calls `this.getSchema({ type })`.

### `uuidV5` refuses a malformed name

<Badge type="warning" text="Behavior" />

A name holding a lone surrogate - malformed UTF-16 - now throws a 400. Encoding it silently turned the bad code unit into U+FFFD, so two different malformed names shared one id.

## What else changed

### Compiled binaries get a typed `module` option

<Badge type="tip" text="Enhancement" />

A `bun build --compile` binary ships without `node_modules`, so an optional peer the framework loads by name is not there. The first client then throws `[ModuleUtility.loadSync] ioredis is required ...`. That has been true since `ioredis` became lazy in `@venizia/ignis-helpers` 0.2.0-37. Every `@venizia/ignis` 0.2.0 prerelease accepts that version (`^0.2.0-N`), so a fresh install of any of them picks it up.

Pass the peer in, and the static import puts it inside the binary:

```typescript
import * as ioredis from 'ioredis';
import { RedisSingleHelper } from '@venizia/ignis-helpers';

const redis = new RedisSingleHelper({
  name: 'cache',
  host: 'localhost',
  port: 6379,
  password: 'secret',
  module: ioredis,
});
```

| Class | Option | You pass |
|---|---|---|
| `RedisSingleHelper`, `RedisClusterHelper`, `RedisSentinelHelper`, `createRedisHelper` | `module` | `ioredis` |
| `BullMQHelper` | `module` | `bullmq` |
| `SocketIOClientHelper` | `module` | `socket.io-client` |
| Mail BullMQ queue executor | `module` and `redis.module` | `bullmq` and `ioredis` |

Registering once at the entrypoint also works: `ModuleUtility.register({ modules: { ioredis, bullmq } })`. A test builds a real binary and runs it with no `node_modules` to prove both ways. See [Compiled binaries](/references/utilities/module#compiled-binaries).

### `TemporalHelper`

<Badge type="tip" text="New Feature" />

Dates in a time zone you name, through the library you choose: the runtime's `Temporal`, your dayjs or your Luxon. An adapter only reports a zone's UTC offset; the helper builds the wall clock and resolves daylight-saving gaps and repeats itself, so the adapters never disagree on them. The three adapters agree on any host. The one exception is dayjs before 1914: it misreads some zones' local mean time. It reads a `Date`, epoch milliseconds or an ISO string, and returns a `Date`. It ships on `@venizia/ignis-helpers/temporal`, and on the root and `/core`. See [Temporal](/extensions/helpers/temporal/).

### `ModelFactory.defineEntity`

<Badge type="tip" text="New Feature" />

An entity class built from a plain drizzle table, with relations that point at tables and a row type that includes them. A `one` relation now reads its columns off the table's foreign key. See [A Model Declares Each Fact Once](./2026-09-19-define-entity).

### Optional peers stay optional

<Badge type="tip" text="Enhancement" />

- `@venizia/ignis-kernel/repository` and `@venizia/ignis-connectors/http` load without `hono` or `@hono/zod-openapi` installed.
- `@venizia/ignis-kernel/repository` also exports `DEFAULT_LIMIT`, `DEFAULT_MAX_LIMIT`, `RepositoryOperationScopes`, `CoreErrorCodes`, `SearchErrorCodes`, `throwNotSupported` and `SchemaTypes`.
- `BullMQHelper` loads `bullmq` when it builds a queue or worker, not at import, so `@venizia/ignis/mail` needs `bullmq` only with the BullMQ executor.
- `SocketIOClientHelper` loads `socket.io-client` in `configure()`, so a server that only uses the socket.io server helper does not need the client package.

### Node's ESM loader works

<Badge type="info" text="Bug Fix" />

The ESM builds of `inversion`, `filter` and `boot` imported files without a `.js` extension, which Node's ESM loader refuses. Every package now imports under Node, Bun and a bundler. Every `dist/esm` also carries a `package.json` with `"type": "module"`, so Node stops parsing each file as CommonJS first: importing `@venizia/ignis-connectors/http` went from 38.0 to 30.7 ms.

### A clean-install gate

<Badge type="tip" text="Enhancement" />

`make clean-install` packs every package and installs each one alone into an empty project, with only its required peers plus the peers a sub-path is allowed. It then loads every published sub-path four ways: Bun import, Node ESM import, Node require, and a browser build for the entries that claim browser purity. Each check runs under both the hoisted and the isolated linker. CI runs it, and the release workflow runs `make clean-install-<package>` before publishing. The workspace installs every optional peer, so a sub-path that reaches one it should not is invisible anywhere else.

### UUIDs

<Badge type="tip" text="Enhancement" />

- **Point-free use is safe.** `uuidV4`, `uuidV7`, `createUuidV4()`, `createUuidV7()` and `UuidHelper.getInstance().v4` / `.v7` ignore any argument: `Array.from({ length: 3 }, uuidV7)`, `ids.map(uuidV4)` and hono's `requestId({ generator: uuidV7 })` all work.
- **v7 no longer uses `Bun.randomUUIDv7`, on any runtime.** The IGNIS generator measured 43 ns against 58 ns for the native one. The native one also reads its arguments as an encoding and a timestamp, so passed point-free it stamps ids at the 1970 epoch.
- **v4** calls `crypto.randomUUID` with no argument, captured once, and falls back to `crypto.getRandomValues` outside a secure context.
- **v5** reads the namespace in either case and accepts the nil UUID as a namespace. A very long name no longer keeps its buffer for the life of the process.
- **`UuidHelper.getInstance()`** is one instance per module copy. v7 ids still climb in one sequence per realm.

Against `uuid@14` on Bun 1.4.2, median: v4 at parity (both call `crypto.randomUUID`), v5 395 ns against 1163, v7 43 ns against about 210.

### A helper's logger

<Badge type="tip" text="Enhancement" />

- **`BaseHelper.logger` resolves on its first read**, then stays on the instance as a non-enumerable property. A repeated read is a plain property read, measured more than 20 times faster.
- **A logger read before any provider loads upgrades itself** on its next call once `LoggerFactory` is imported - children taken with `.for()` included. Before, it stayed on the console.
- **A debug line obeys `DEBUG` on every path.** An upgraded logger hands each line to the level's own method, and `log('debug', ...)` on the built-in loggers is gated like `debug()`. Before, both paths wrote debug lines to the real transports with `DEBUG` unset.
- **With no provider at all**, it logs to the console and, under Node or Bun, prints one warning per process - even one holding both the CommonJS and the ESM build: ``[BaseHelper] Logging to the console - no logger provider is installed. Import `LoggerFactory` from `@venizia/ignis-helpers` at startup.``

That upgrade path costs bundle size: `BaseHelper` alone grows from 639 B to about 820 B gzipped in a browser build. The extra bytes are the logger that writes to the console and then hands over, plus the one-time warning. Before, a helper that logged early stayed on the console for good.

## Correcting two earlier changelogs

- [One UUID Helper, Three Versions](./2026-09-18-uuid-helper) says nothing was removed and `UuidV7Generator` is still exported. `UuidV7Generator` was removed in `@venizia/ignis-helpers` 0.2.0-39; use `uuidV7` or `UuidHelper.getInstance().v7`. The same page calls IGNIS faster than `uuid@14` on all three versions. For v4 the two are at parity - both call `crypto.randomUUID`.
- [String Ids Are UUID v7](./2026-09-17-string-ids-are-uuid-v7) says Bun uses its native `Bun.randomUUIDv7`. From this release, no runtime does.

## Who is affected

- **Code that used the IGNIS date utility.** Migrate - see the checklist.
- **Code importing search controllers or `RecursiveTreeSql` from an entry that no longer carries them.** Change the import.
- **Compiled binaries using Redis, BullMQ or the socket.io client.** Pass `module`, or register the peer.
- **Everything else.** No action needed.

## See also

- [Temporal](/extensions/helpers/temporal/) - `TemporalHelper`, its adapters, and the dayjs migration
- [A Model Declares Each Fact Once](./2026-09-19-define-entity) - `ModelFactory.defineEntity`
- [Compiled binaries](/references/utilities/module#compiled-binaries) - every `module` option, and `ModuleUtility.register`
- [UID](/extensions/helpers/uid/) - the UUID generators
- [Logger](/extensions/helpers/logger/) - how a helper's logger resolves

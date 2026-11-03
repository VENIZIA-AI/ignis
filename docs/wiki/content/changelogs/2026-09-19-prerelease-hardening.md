---
title: Dates Move Out, and Every Entry Loads On Its Own
description: "The 0.2.0-48 prerelease: the dayjs date utility gives way to TemporalHelper, search controllers and RecursiveTreeSql move to their own entries, compiled binaries get a typed module option, and Node ESM works."
packages: ['@venizia/ignis-connectors', '@venizia/ignis', '@venizia/ignis-helpers', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-19

One batch, so an application migrates once. It ships in `@venizia/ignis` 0.2.0-48 and the packages released with it.

## Breaking changes

### The date utility is gone

<Badge type="danger" text="Breaking" />

`@venizia/ignis-helpers` no longer exports `dayjs`, `isWeekday`, `getPreviousWeekday`, `getNextWeekday` or `getDateTz`. It no longer sets the `dayjs.tz` default zone, and `dayjs` is no longer one of its dependencies. `sleep` and `hrTime` stay.

- **Keep dayjs.** Run `bun add dayjs` and configure it once. IGNIS used to extend `customParseFormat`, `utc`, `timezone`, `weekday` and `isoWeek`, and set the default zone to `APP_ENV_APPLICATION_TIMEZONE` or `Asia/Ho_Chi_Minh`. Call `dayjs.tz.setDefault(...)` yourself.
- **Or move to `TemporalHelper`.** It maps each removed function. See [Replace the dayjs IGNIS used to export](/extensions/helpers/temporal/#replace-the-dayjs-ignis-used-to-export).
- `APP_ENV_APPLICATION_TIMEZONE` now feeds only the startup banner.

> [!WARNING]
> Keep `customParseFormat`. Without it, `dayjs(value, format)` ignores the format, and some formats parse to the wrong date without an error. `dayjs('09/10/2026', 'DD/MM/YYYY')` reads as 10 September instead of 9 October, and `dayjs('260919', 'YYMMDD')` lands in the year 2610. A compact `YYYYMMDDHHmmss` value still parses correctly.

```typescript
import { TemporalHelper } from '@venizia/ignis-helpers/temporal';

const temporal = new TemporalHelper({ timeZone: 'Asia/Ho_Chi_Minh' });

temporal.parse({ value: '20260919120000', pattern: 'YYYYMMDDHHmmss' }); // 2026-09-19T05:00:00.000Z
temporal.nextWeekday({ value: new Date() }); // next Monday to Friday, in Ho Chi Minh City
```

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

Affected names: `AbstractSearchController`, `SearchControllerFactory`, `defineSearchRouteConfigs`, `ISearchControllerOptions`, `ISearchCustomizableRoutes`. Import them from `/search/controllers` or `/typesense/controllers`, on either package.

### `RecursiveTreeSql` moved from the kernel to connectors

<Badge type="danger" text="Breaking" />

`RecursiveTreeSql`, `RecursiveTreeDirections`, `IRecursiveTreeOptions` and `TRecursiveTreeDirection` are gone from `@venizia/ignis-kernel`. Import them from `@venizia/ignis` (root) or `@venizia/ignis-connectors` (root, `./relational`, `./postgres`, `./sqlite`).

### The entity base class loosened two statics

<Badge type="danger" text="Breaking" />

- **`BaseRelationalEntity.schema` (static) is typed `Table`.** Code that read `.schema.id` off `typeof BaseEntity` reads it off the concrete class or the instance.
- **The protected static `schemaFactory` getter is gone.** Call `this.getSchema({ type })` instead.

### `uuidV5` refuses a malformed name

<Badge type="warning" text="Behavior" />

A name holding a lone surrogate (malformed UTF-16) now throws a 400. Before, two different malformed names could share one id. Expect the 400, or clean the string first.

## What else changed

### Compiled binaries get a typed `module` option

<Badge type="tip" text="Enhancement" />

A `bun build --compile` binary ships without `node_modules`, so an optional peer loaded by name is missing, and the first client throws `[ModuleUtility.loadSync] ioredis is required ...`. This has been true since `ioredis` became lazy in `@venizia/ignis-helpers` 0.2.0-37, and every `@venizia/ignis` 0.2.0 prerelease accepts that version, so a fresh install of any of them picks it up. Pass the peer in:

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

Registering once at the entrypoint also works: `ModuleUtility.register({ modules: { ioredis, bullmq } })`. See [Compiled binaries](/references/utilities/module#compiled-binaries).

### `TemporalHelper`

<Badge type="tip" text="New Feature" />

Dates in a time zone you name, through the library you choose: the runtime's `Temporal`, your dayjs or your Luxon. It reads a `Date`, epoch milliseconds or an ISO string, and returns a `Date`. The three adapters agree on any host, except dayjs before 1914, which misreads some zones' local mean time. It ships on `@venizia/ignis-helpers/temporal`, and on the root and `/core`. See [Temporal](/extensions/helpers/temporal/).

### `ModelFactory.defineEntity`

<Badge type="tip" text="New Feature" />

An entity class built from a plain drizzle table, with relations that point at tables and a row type that includes them. See [A Model Declares Each Fact Once](./2026-09-19-define-entity).

### Optional peers stay optional

<Badge type="tip" text="Enhancement" />

- `@venizia/ignis-kernel/repository` and `@venizia/ignis-connectors/http` load without `hono` or `@hono/zod-openapi` installed.
- `@venizia/ignis-kernel/repository` also exports `DEFAULT_LIMIT`, `DEFAULT_MAX_LIMIT`, `RepositoryOperationScopes`, `CoreErrorCodes`, `SearchErrorCodes`, `throwNotSupported` and `SchemaTypes`.
- `BullMQHelper` loads `bullmq` when it builds a queue or worker, not at import, so `@venizia/ignis/mail` needs `bullmq` only with the BullMQ executor.
- `SocketIOClientHelper` loads `socket.io-client` in `configure()`, so a server that only uses the socket.io server helper does not need the client package.

### Node's ESM loader works

<Badge type="info" text="Bug Fix" />

The ESM builds of `inversion`, `filter` and `boot` imported files without a `.js` extension, which Node's ESM loader refuses. Every package now imports under Node, Bun and a bundler.

### UUIDs

<Badge type="tip" text="Enhancement" />

- **Point-free use is safe.** `Array.from({ length: 3 }, uuidV7)`, `ids.map(uuidV4)` and hono's `requestId({ generator: uuidV7 })` all work.
- **v7 no longer uses `Bun.randomUUIDv7`, on any runtime.** Passed point-free, the native one stamped ids at the 1970 epoch.
- **v4** falls back to `crypto.getRandomValues` outside a secure context.
- **v5** reads the namespace in either case and accepts the nil UUID as a namespace.

### A helper's logger

<Badge type="tip" text="Enhancement" />

- **A logger read before any provider loads upgrades itself** on its next call once `LoggerFactory` is imported, children taken with `.for()` included. Before, it stayed on the console.
- **A debug line obeys `DEBUG` on every path.** Before, an upgraded logger and `log('debug', ...)` on the built-in loggers wrote debug lines with `DEBUG` unset.
- **With no provider at all**, it logs to the console and, under Node or Bun, prints one warning per process: ``[BaseHelper] Logging to the console - no logger provider is installed. Import `LoggerFactory` from `@venizia/ignis-helpers` at startup.``

## Correcting two earlier changelogs

- [One UUID Helper, Three Versions](./2026-09-18-uuid-helper) says `UuidV7Generator` is still exported. It was removed in `@venizia/ignis-helpers` 0.2.0-39; use `uuidV7` or `UuidHelper.getInstance().v7`. For v4, IGNIS is at parity with `uuid@14`, not faster.
- [String Ids Are UUID v7](./2026-09-17-string-ids-are-uuid-v7) says Bun uses its native `Bun.randomUUIDv7`. From this release, no runtime does.

## Who is affected

- **Code that used the IGNIS date utility.** Migrate as above.
- **Code importing search controllers or `RecursiveTreeSql` from an entry that no longer carries them.** Change the import.
- **Compiled binaries using Redis, BullMQ or the socket.io client.** Pass `module`, or register the peer.
- **Everything else.** No action needed.

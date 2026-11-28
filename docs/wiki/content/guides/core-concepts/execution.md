---
title: Execution frames
description: Say who is running - a request, a job, a tick or system work - with Execution.run, so row scopes, audit columns and logs agree
difficulty: intermediate
---

# Execution frames

An execution frame says who work runs for: one tenant, one user, or the system. Web requests get a frame from the framework; your jobs and scripts name theirs with `Execution.run`:

```typescript
import { Execution, ExecutionModes } from '@venizia/ignis';

// one tenant's work
await Execution.run({
  mode: ExecutionModes.SCOPED,
  values: { tenantId: job.data.tenantId },
  task: () => this.invoiceService.close(),
});

// work across tenants
await Execution.run({
  mode: ExecutionModes.SYSTEM,
  reason: 'draft order reaper',
  task: () => this.orderService.reapDrafts(),
});
```

You need no `AsyncLocalStorage` of your own for identity. A runnable version is in the [SQLite quickstart](https://github.com/VENIZIA-AI/ignis/blob/main/examples/sqlite-quickstart/src/services/task.service.ts).

## What a frame is

```typescript
const frame = Execution.current(); // undefined outside every frame
```

| Field | Meaning |
|---|---|
| `mode` | `ExecutionModes.SCOPED` sees rows by its scope; `ExecutionModes.SYSTEM` sees every row |
| `userId` | Who the work is done for. A request frame names none: the audit columns read the request's user |
| `values` | Your own keys, such as the tenant. A frozen copy |
| `reason` | Why a system frame sees everything |
| `request` | The web request, when there is one. Read it with `useRequestContext()` |

Declare your keys once:

```typescript
declare module '@venizia/ignis' {
  interface IExecutionValues {
    tenantId?: string;
  }
}
```

`values` and `userId` are claims your server code makes. A scoped run that names another tenant reads that tenant, with no log. Never copy them from a request (body, query, header, path) without checking them against the caller.

## Nested runs

The innermost frame wins:

```typescript
await Execution.run({
  mode: ExecutionModes.SYSTEM,
  reason: 'nightly billing',
  task: () =>
    // scoped again: the system rights stop here
    Execution.run({
      mode: ExecutionModes.SCOPED,
      values: { tenantId: 'tenant-a' },
      task: () => this.invoiceService.close(),
    }),
});
```

| Rule | Meaning |
|---|---|
| Mode | Comes from that call alone. Rights are never inherited |
| Request, user, values | Inherited by a nested frame. `values` merge key by key |
| `isRoot: true` | A scoped frame that inherits nothing |
| A system run inside a scoped frame with `values` | Sees every row. Logged as a warning, once per reason |
| A promise still running after `run` returns | Keeps its frame, system rights included |

Don't wrap the whole boot in a system run: a listener or a timer your code starts inside it can stay system. Wrap only the reads that need it.

## Web requests

A server application (`BaseApplication`) opens a scoped frame for every request. You write no code for it:

```typescript
import { useRequestContext } from '@venizia/ignis';

const request = useRequestContext(); // the request of the current frame
```

The user is not copied into the frame. It is read from the request when needed, so authentication that runs after the frame opens is still seen.

## Jobs, consumers and ticks

A queue job, a cron tick and a Kafka or MQTT message start a root frame: scoped, with no user and no values. They never run with the rights of the code that registered them. Name who the work is for:

```typescript
await Execution.run({
  mode: ExecutionModes.SCOPED,
  values: { tenantId: message.tenantId },
  task: () => this.invoiceService.close(),
});
```

A scoped model reads nothing in a frame that names nobody.

| Work | Frame it starts in |
|---|---|
| Web request, gRPC call | Scoped, with the request |
| Queue job, cron tick, Kafka or MQTT message, Socket.IO, TCP, UDP or worker-thread event, secrets rotation | Root: nothing of whoever started the listener |
| Websocket event | Root, with the client's user once known |
| Event bus handler | The publisher's request, user and values; never system |
| Sequential queue element | The user and values at enqueue; no request, never system |

### Carry identity through a BullMQ job

A job carries no identity by itself. Opt in with the `metadata` option: the producer stamps every job it adds, and the worker reads the stamp as `context.metadata`.

```typescript
import { Execution, ExecutionModes, ExecutionRunner, type IRedisHelper } from '@venizia/ignis';
import { BullQueueRoles } from '@venizia/ignis-helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import type { InvoiceService } from '@/services/invoice.service';

interface IInvoiceJob {
  tenantId: string;
}

interface IJobIdentity {
  userId?: string;
}

export class InvoiceQueue {
  static producer(opts: { redisConnection: IRedisHelper }) {
    return new BullMQHelper<IInvoiceJob, void, IJobIdentity>({
      queueName: 'invoices',
      identifier: 'invoice-producer',
      role: BullQueueRoles.QUEUE,
      redisConnection: opts.redisConnection,
      metadata: () => {
        const { userId } = ExecutionRunner.capture();

        return { userId: userId === undefined ? undefined : String(userId) };
      },
    });
  }

  static worker(opts: { redisConnection: IRedisHelper; invoiceService: InvoiceService }) {
    return new BullMQHelper<IInvoiceJob, void, IJobIdentity>({
      queueName: 'invoices',
      identifier: 'invoice-worker',
      role: BullQueueRoles.WORKER,
      redisConnection: opts.redisConnection,
      onWorkerData: (job, { metadata }) =>
        Execution.run({
          mode: ExecutionModes.SCOPED,
          values: { tenantId: job.data.tenantId },
          userId: metadata?.userId,
          task: () => opts.invoiceService.close(),
        }),
    });
  }
}
```

- `ExecutionRunner.capture()` answers the current user, the request's included, and the `values`.
- The stamp is stored in Redis and returned unvalidated. Anyone who writes to your Redis can forge it, and the job data too.
- Never read a mode from a job. A job that needs every row opens its own system run with its own `reason`.
- A `bigint` user id does not serialize to JSON: send it as text.

## System runs

```typescript
await Execution.run({
  mode: ExecutionModes.SYSTEM,
  reason: 'draft order reaper',
  task: () => this.orderService.reapDrafts(),
});
```

- `reason` is required. A missing one does not compile; a blank one throws. Write a fixed sentence that names the work.
- A system frame lifts a model's `access` without calling `resolve`. A write goes in as given: `write.mode: 'assign'` fills nothing.
- `userId` is optional; without it, the frame inherits the one around it.

Every system run is logged:

| Event | Level |
|---|---|
| System run with no request | `debug` |
| System run inside a request | `info`, with the request id |
| System run opened inside a scoped frame with `values` | `warn`, once per reason |
| A hand-off that drops system rights | `warn`, once per queue or event name |
| A root frame opened inside a frame with a request or a user | `warn`, once per route |

Each warning stops after 100 different keys.

## Row access: resolve and scope

A model's [`access.resolve`](/guides/core-concepts/persistent/model-settings#_4-access) receives the current frame as `scope`. The framework hands the frame over as it is: **your `resolve` must let `values` narrow what a request's user sees, never replace it.**

```typescript
import { model } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
import { currentUserTenantIds } from '@/utilities/tenant';
import { invoiceTable } from './invoice.table';

declare module '@venizia/ignis' {
  interface IExecutionValues {
    tenantIds?: string[];
  }
}

@model({
  settings: {
    access: {
      resolve: ({ scope }) => {
        const named = scope?.values.tenantIds;
        const own = currentUserTenantIds(); // undefined when no request user

        // With a user, values only narrow. Without one (a job), the server code's claim is the scope.
        const tenantIds = own ? (named ? named.filter((id) => own.includes(id)) : own) : named;

        return tenantIds?.length ? { tenantId: { in: tenantIds } } : null;
      },
    },
  },
})
export class Invoice extends ModelFactory.defineEntity({ table: invoiceTable }) {}
```

| Frame | What reaches the model |
|---|---|
| System | Every row; `resolve` is not called |
| Scoped | What `resolve` answers for the operation and the frame |
| None | `resolve` gets `scope: undefined`. Answer `null` when you cannot tell who is asking |

With no resolved scope and the default `onMissing: 'deny'`, a read finds nothing and a write throws `403`.

A root run drops the request, and with it the user your `resolve` narrows by. A request user of tenant A who reaches a root run naming tenant B reads B.

## Audit user

The audit columns (`createdBy`, `modifiedBy`) take the frame's `userId`, else the user that authentication put on the request:

```typescript
await Execution.run({
  mode: ExecutionModes.SYSTEM,
  reason: 'price import',
  userId: importerId,
  task: () => this.priceService.importAll(),
});
```

A root frame has no user until you name one. An audit column with `allowAnonymous: false` then refuses the write.
The user must fit the column: a text column stores a number user as its text, and a number column takes a whole number, written as one or as decimal text. Anything else is refused.

## Hand-offs

The event bus and `SequentialQueueHelper` run work later, for whoever handed it on. System rights never travel:

```typescript
import { Execution, ExecutionModes } from '@venizia/ignis';
import { SequentialQueueHelper } from '@venizia/ignis-helpers';

const queue = new SequentialQueueHelper<{ invoiceId: string }>({
  identifier: 'invoice-mails',
  onMessage: ({ queueElement }) => {
    // scoped: the user and values at enqueue; no request
    return this.invoiceService.send({ invoiceId: queueElement.payload.invoiceId });
  },
});

await Execution.run({
  mode: ExecutionModes.SCOPED,
  values: { tenantId: 'tenant-a' },
  task: () => queue.enqueue({ invoiceId: 'invoice-1' }),
});
```

| Hand-off | What travels | Frame at the other end |
|---|---|---|
| Event bus handler, retries included | Request, user and values captured at publish | Scoped. A retried handler can run after the response |
| Sequential queue element | User and values captured at enqueue; never the request | Root, built from them |

A handler published from a system run reads by its scope, and the drop is logged once. Work that needs every row opens a system run inside the handler.

## Your own listeners

A listener you register yourself (an emitter, a Redis `message`) keeps whatever frame it was started or emitted in. Start it from a root frame:

```typescript
emitter.on('price-changed', (tenantId: string) =>
  Execution.fireAndForget({
    scope: 'PriceListener',
    execution: Execution.run({
      mode: ExecutionModes.SCOPED,
      isRoot: true,
      values: { tenantId },
      task: () => this.priceService.refresh(),
    }),
  }),
);
```

`run` returns a promise, and an emitter does not await it: `Execution.fireAndForget` logs its rejection.

## Scripts and tests

A server application installs the runner when it is constructed. A script or a test with no application installs it itself:

```typescript
import { Execution, ExecutionModes, ExecutionRunner } from '@venizia/ignis';

ExecutionRunner.install();

await Execution.run({
  mode: ExecutionModes.SYSTEM,
  reason: 'backfill invoice totals',
  task: () => backfill(),
});
```

Without a runner, `run` throws and `current()` is `undefined`. The framework's listeners and queues run their tasks as before, and `sleep`, `withTimeout`, `withLimit` and `fireAndForget` work, in a browser too. The first install wins.

## Tests that do not boot an application

A test that starts no `BaseApplication` has no runner and no request frame: a repository test, a shared test preload, or a bare Hono app. `ExecutionTestHarness` from `@venizia/ignis/testing` adds what is missing.

```typescript
// test/preload.ts - listed under [test] preload in bunfig.toml
import { ExecutionTestHarness } from '@venizia/ignis/testing';

ExecutionTestHarness.install();
```

With the runner installed, name who each call runs for:

```typescript
// __tests__/invoice-repository.test.ts
import { Execution, ExecutionModes } from '@venizia/ignis';
import { expect, test } from 'bun:test';
import { invoiceRepository } from './helpers/invoices';

test('a tenant reads its own invoices', async () => {
  const rows = await Execution.run({
    mode: ExecutionModes.SCOPED,
    values: { tenantId: 'tenant-a' },
    task: () => invoiceRepository.find({ filter: {} }),
  });

  expect(rows.every((row) => row.tenantId === 'tenant-a')).toBe(true);
});
```

A bare Hono app needs the request frame too. `mount` installs the runner and runs every request in a scoped frame. Call it before you add routes: Hono runs handlers in the order you register them, so a route added earlier gets no frame.

```typescript
// __tests__/frame.test.ts
import { useRequestContext } from '@venizia/ignis';
import { ExecutionTestHarness } from '@venizia/ignis/testing';
import { expect, test } from 'bun:test';
import { Hono } from 'hono';

test('a request has a frame', async () => {
  const app = ExecutionTestHarness.mount({ app: new Hono() });
  app.get('/frame', (context) => context.json({ isFramed: useRequestContext() === context }));

  const response = await app.request('/frame');

  const body = await response.json();

  expect(body).toEqual({ isFramed: true });
});
```

- Both methods are safe to call again.
- The frame names no tenant, and authentication is your own middleware: a scoped model reads nothing until a user or `values` give `resolve` a scope.
- A `BaseApplication` installs the runner when it is constructed, and its server frames each request. A request sent straight to `getRootRouter()` skips the server, so it has no frame, also after a boot, and `mount` cannot add one to routes already registered.

## Lint rules

| Rule | Default | Reports |
|---|---|---|
| `@venizia/static-execution-reason` | On in `houseConfigs`, off in tests | A system run whose `reason` is not written in the code, or is blank |
| `@venizia/restrict-execution-call-sites` | Off | `Execution.run` in a file you did not list |

The reason can be a string, a template without expressions, a `const` of the file, or a `static readonly` field of a class of the file. A constant imported from another file is reported.

Turn the call-site rule on with your own lists. Globs are relative to the working directory:

```javascript
// .configs/lints/eslint.config.mjs
import { houseConfigs, RestrictExecutionCallSitesRule } from '@venizia/dev-configs/linters';

export default [
  ...houseConfigs,
  {
    files: ['**/*.ts'],
    rules: {
      [RestrictExecutionCallSitesRule.NAME]: RestrictExecutionCallSitesRule.build({
        allow: ['src/jobs/**'],
        allowRoot: ['src/listeners/**'],
      }),
    },
  },
];
```

- `allow`: files that may call `Execution.run` without `isRoot`.
- `allowRoot`: files that may also set `isRoot`. Options the rule cannot read (a spread, a variable) count as root. The framework's internal `ExecutionFrames.run` and `ExecutionFrames.root` need this list too.
- With no list, every call is reported.

## Codemods

```bash
# both are dry runs until you add --write
devz codemod execution-class src
devz codemod execution-scope --map scope-helpers.json src
```

`execution-class` renames `PromiseUtility` to `Execution`, `executeWithLimit` to `withLimit` and `voidExecution` to `fireAndForget`.

`execution-scope` rewrites calls of your own scope helpers to `Execution.run`. You name them in a map:

```json
{
  "runElevated": { "mode": "system" },
  "runPinned": { "mode": "scoped", "values": { "tenantIds": "tenantIds" } }
}
```

- A helper is read when it is imported from a module of your application (a path starting `.`, `@/`, `~/` or `#`). For a helper from a package, add `"from": "@acme/core"` to its entry. With `from`, only that module is read; the same name from anywhere else is listed, not rewritten.
- A system call gets the reason `TODO: reason (<file>:<method>)` for you to write.
- It lists the calls it cannot read, and the event handlers and queue consumers to review.
- It lists, and leaves unrewritten, a system call lexically inside a scoped one: under "innermost wins" it would see more. Review it, then pass `--rewrite-nested`. It does not follow calls across functions.
- `--write` changes files; it needs a path or `--all`. There is no `--reverse`.

Run `devz codemod execution-scope --help` for the call shapes it reads.

## Troubleshooting

| You see | Cause | Fix |
|---|---|---|
| `403`, code `core.repository.scope_write_denied`, "no scope could be resolved for this caller" | A create, update, delete, soft delete or restore ran where `resolve` answered no scope: a job with no `values`, a listener, a script | Open a scoped run that names the tenant, or a system run |
| The same code with another detail | The written row, or the parent of a [`through`](/guides/core-concepts/persistent/model-settings#scope-a-child-through-its-parent) child, is outside the scope, or the write guard [cannot verify](/guides/core-concepts/persistent/model-settings#write-mode) the scope | Write inside the scope, with a scope the guard can read |
| A read in a job returns nothing, with no error | The frame names nobody | As above |
| An update or delete returns `count: 0` | The row is outside a resolved scope | Check the frame's `values` |
| `[Execution] no runner \| call ExecutionRunner.install()` | A script or a test with no application | Call `ExecutionRunner.install()` first; in a test, see [Tests that do not boot an application](#tests-that-do-not-boot-an-application) |
| A request in a test has no frame: `useRequestContext()` is `undefined` | A bare Hono app, or a route added before `mount` | Call [`ExecutionTestHarness.mount`](#tests-that-do-not-boot-an-application) before the routes |
| Boot fails: `settings.access declared while no execution runner is installed` | Models with `access` on a host with no runner | Serve them from a server application, or call `ExecutionRunner.install()` before boot |

Match the code, not the message: `error.normalized.code` equals `RepositoryErrorCodes.SCOPE_WRITE_DENIED`.

## See also

- [Execution reference](/references/utilities/promise) - `sleep`, `withTimeout`, `withLimit`, `fireAndForget`
- [Model settings: access](/guides/core-concepts/persistent/model-settings#_4-access) - `resolve`, `onMissing`, the write guard

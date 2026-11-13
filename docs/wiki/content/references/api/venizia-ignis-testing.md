---
title: "@venizia/ignis/testing"
description: "Every export of @venizia/ignis/testing, from the built declarations (generated)."
---

# `@venizia/ignis/testing`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

3 exports, 3 with TSDoc. 12 more are re-exported from other entries (listed at the end).

## `ApplicationBootAssertion`

*class*

Proves an IGNIS application boots, without a datasource connection, a socket or a secrets provider:
it runs the application's own boot sequence (`init()` then `initialize()`) and never calls `start()`,
so no socket is opened and no post-start hook runs.

Datasources are bound and resolved but not configured, unless named in `keepDataSources`; the
secrets steps are skipped; every other step and every component runs as in a real boot. A component
that opens Redis, Kafka or S3 in `binding()` therefore runs for real: name it in `skipComponents`.
`setupMiddlewares()` is not run: it is the application's own start-time step, user code that may open
connections, and the probe cannot know it is free of side effects. The framework's default stack (CORS, body
limit, request id) is a boot step of `initialize()`, so an invalid `configs.middlewares` value still fails here.
When the boot fails inside a component, one warning names it; the rejection is still the original error. When the
boot fails, the rejection is the original error. The application stays booted and is returned;
a failed boot leaves a half-booted instance, so build a new one rather than reuse it.

It wraps `registerDynamicBindings` and `getBootSequence` on THIS instance only (an application's
own override of either still runs) and restores them whatever happens.

It owns the process-wide `AuthorizationEnforcerRegistry` for the duration of the check: it resets it before it
boots, so a second boot in the same process (another probe, or a test boot after this one) does not fail with
`Enforcer already registered`. An application still running in the same process loses its enforcer registrations
and its authorize options, so its requests are then decided by the no-enforcer default (deny unless configured
otherwise): do not run the probe in a process that serves an application.

**Example**
```typescript
import { ApplicationBootAssertion } from '@venizia/ignis/testing';
import { test } from 'bun:test';
import { Application } from './application';

test('the application boots offline', async () => {
  await ApplicationBootAssertion.assert({
    application: () => new Application({ scope: 'Application', config: { host: '127.0.0.1', port: 0, path: { base: '/', isStrict: true } } }),
    options: { skipComponents: ['MailComponent'], allowNoControllers: true },
  });
});
```

```ts
export declare class ApplicationBootAssertion {
    static assert<Application extends BaseApplication>(opts: {
        application: Application | (() => Application | Promise<Application>);
        options?: IAssertApplicationBootsOptions;
    }): Promise<Application>;
}
```

Source: `packages/core-server/src/testing/assert-application-boots.ts`

## `IAssertApplicationBootsOptions`

*interface*

Options of `ApplicationBootAssertion.assert`; each field narrows or relaxes what the boot probe runs and verifies.

```ts
export interface IAssertApplicationBootsOptions {
    /**
     * Datasources whose real `configure()` runs. Every other datasource is bound and resolved but not
     * configured, so no connection is made. Close a kept one with `await application.stop()`.
     *
     * @default []
     */
    keepDataSources?: TBootProbeTarget[];
    /**
     * Components whose `configure()` (and so their `binding()`) is skipped, for the few that need
     * infrastructure. What a skipped component would have registered is not registered.
     *
     * @default []
     */
    skipComponents?: TBootProbeTarget[];
    /**
     * Boot steps that do not run, so a remote secrets provider is never contacted. A value REPLACES
     * the default; an unknown name rejects before anything boots.
     *
     * @default [ServerBootSteps.HYDRATE_SECRETS, ServerBootSteps.WIRE_SECRET_ROTATABLES]
     */
    skipSteps?: TServerBootStep[];
    /**
     * After boot, resolves every service and repository with the shared core of
     * `@venizia/ignis-inversion`, so an injection nobody references at boot still fails. An explicit value
     * wins over the application's own `bootChecks`, whose boot step is off for the run.
     *
     * @default true
     */
    verifyBindings?: boolean;
    /**
     * Services or repositories the verification leaves unresolved, for one whose constructor needs
     * infrastructure. A class (exact), a class name or a binding key. A name that matches nothing rejects.
     *
     * @default []
     */
    skipBindings?: TBootProbeTarget[];
    /**
     * Whether an application that registered no controller passes. Off, it fails: it proves nothing, for example when the artifact index was empty.
     *
     * @default false
     */
    allowNoControllers?: boolean;
    /**
     * This helper's own check that no method and path is mounted twice. IGNIS boot does not detect that.
     *
     * @default true
     */
    routes?: boolean;
}
```

Source: `packages/core-server/src/testing/assert-application-boots.ts`

## `TBootProbeTarget`

*type*

A class (matched against the instance's constructor) or a string (matched against the binding key or the class name).

```ts
export type TBootProbeTarget = TClass<AnyType> | string;
```

Source: `packages/core-server/src/testing/assert-application-boots.ts`

## Re-exported

- `IPostgresTransactionDoubleOptions` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `ISqliteTransactionDoubleOptions` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `ITransactionDoubleOptions` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `PostgresTransactionDouble` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `RepositoryDouble` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `SqliteTransactionDouble` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `TransactionDouble` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `TransactionStates` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `TRepositoryWithTransactions` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `TTransactionDoubleEvent` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `TTransactionDoubleHook` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)
- `TTransactionState` from [`@venizia/ignis-connectors/testing`](/references/api/venizia-ignis-connectors-testing)

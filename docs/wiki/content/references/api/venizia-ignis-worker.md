---
title: "@venizia/ignis-worker"
description: "Every export of @venizia/ignis-worker, from the built declarations (generated)."
---

# `@venizia/ignis-worker`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

18 exports, 18 with TSDoc.

## `BFF_SYNTHETIC_ORIGIN`

*const*

Every request built inside the Worker uses this origin. Never `self.location.href`: a `blob:`
worker origin is opaque and `new URL(path, blobUrl)` throws, and Hono's `getPath()` mis-parses
`file://`. Hono never resolves the host - it string-scans from `indexOf(':') + 4`.

```ts
export declare const BFF_SYNTHETIC_ORIGIN = "http://ignis.internal";
```

Source: `packages/core-worker/src/envelope/encode.ts`

## `BffEnvelope`

*class*

Turns `Request`/`Response`/`Error` into plain structured-cloneable shapes and back - none of the three survives `postMessage` as itself.

```ts
export declare class BffEnvelope {
    /**
     * Statuses the Fetch spec forbids a body on - `new Response(body, { status })` throws if `body`
     * is anything but `null` for one of these, even an empty `ArrayBuffer`.
     */
    private static readonly NULL_BODY_STATUSES;
    /**
     * Moves a URL onto the synthetic origin, keeping everything below it. A caller builds a request
     * against the page's real origin (or a relative path resolved against it); `decodeRequest` on the
     * far side always reconstructs on `BFF_SYNTHETIC_ORIGIN`.
     */
    static toSyntheticUrl(opts: {
        url: string;
    }): string;
    /**
     * `url` overrides the request's own, so the origin rewrite costs nothing: rebuilding the `Request`
     * to change its URL would read the body a second time, and a 10 MB upload would hold 20 MB on the
     * UI thread. Reading the body here disturbs the caller's request exactly as `globalThis.fetch`
     * does with the one it is handed.
     */
    static encodeRequest(opts: {
        request: Request;
        id: string;
        url?: string;
    }): Promise<IBffRequestEnvelope>;
    static decodeRequest(opts: {
        envelope: IBffRequestEnvelope;
    }): Request;
    static encodeResponse(opts: {
        response: Response;
        id: string;
    }): Promise<IBffResponseEnvelope>;
    static decodeResponse(opts: {
        envelope: IBffResponseEnvelope;
    }): Response;
    /**
     * Builds the shape an error crosses `postMessage` as. An `ApplicationError` cannot cross as itself
     * - a custom `Error` subclass loses its name, its own properties and its prototype through
     * structured clone - so it crosses normalised and `decodeError` rebuilds it on the far side.
     *
     * A foreign error gets `500`, matching what the framework's error middleware gives an UNEXPECTED
     * one on the server. Anything reaching here already escaped the whole HTTP layer.
     */
    static encodeError(opts: {
        id: string;
        error: unknown;
    }): IBffErrorEnvelope;
    static decodeError(opts: {
        envelope: IBffErrorEnvelope;
    }): ApplicationError;
}
```

Source: `packages/core-worker/src/envelope/encode.ts`

## `BffFetchBridge`

*class*

Routes the page's own `fetch` into a BFF transport.

```ts
export declare class BffFetchBridge {
    /**
     * Marks the patched `fetch` so a second install is refused rather than silently stacking. `Symbol.for`
     * and not a private symbol: two copies of this package in one page must still see each other's mark.
     */
    private static readonly BRIDGE_MARKER;
    /**
     * Resolves a request's absolute URL WITHOUT constructing a `Request`.
     *
     * This is the whole reason this helper exists rather than one obvious line. `new Request(input)`,
     * where `input` is a `Request` carrying a body, marks that body disturbed - so building one just to
     * read `.url` breaks the very pass-through it is deciding about: the next line hands the same, now
     * unreadable, request to the network.
     *
     * Measured, because the runtimes disagree. Chromium:
     *
     *     original.bodyUsed            // false
     *     new Request(original)
     *     original.bodyUsed            // true
     *     await original.text()        // TypeError: body stream already read
     *
     * Bun does NOT disturb it, so the unit tests pass either way and cannot guard this. The browser is
     * where this code runs, so the browser is the behaviour to write for.
     */
    private static resolveRequestUrl;
    private static toPrefixList;
    /**
     * Routes the page's own `fetch` into a BFF transport for anything under `basePath`, and leaves every
     * other call on the network untouched.
     *
     * This is the seam that lets an existing HTTP client talk to an in-browser IGNIS application without
     * knowing one exists. A data provider, an SDK or a generated client reaches the network through the
     * global `fetch` and usually accepts no custom fetcher, so answering that `fetch` is the only place
     * an in-browser backend becomes a drop-in swap rather than a fork of the client.
     *
     * Install it BEFORE the application that will use it boots: a request issued while the original
     * `fetch` is still in place leaves the page and 404s against whatever is serving it.
     *
     * @returns The uninstall function. It restores the previous `fetch` only if this bridge is still the
     * installed one - if something patched `fetch` afterwards, restoring would silently discard that.
     */
    static install(opts: IInstallBffFetchOptions): () => void;
}
```

Source: `packages/core-worker/src/transport/fetch-bridge.ts`

## `BffRoles`

*class*

Which part this tab plays. `ELECTING` is the brief window before the lock answers.

```ts
export declare class BffRoles {
    static readonly ELECTING = "electing";
    static readonly LEADER = "leader";
    static readonly FOLLOWER = "follower";
}
```

Source: `packages/core-worker/src/transport/shared/common/constants.ts`

## `IBffErrorEnvelope`

*interface*

A custom `Error` subclass loses its name, its own properties and its prototype through structured
clone, so an `ApplicationError` cannot cross as itself. It crosses as its normalised shape and is
rebuilt with `fromError` on the far side.

```ts
export interface IBffErrorEnvelope {
    id: string;
    /**
     * Carried explicitly, because `fromError` defaults a missing one to 400. This envelope is only
     * ever produced when something escaped Hono's `onError` - the 500-class failures a UI must not
     * classify as its own bad request.
     */
    statusCode: number;
    error: {
        text: string;
        code?: string;
        args?: unknown;
    };
}
```

Source: `packages/core-worker/src/envelope/common/types.ts`

## `IBffRequestEnvelope`

*interface*

A request as it crosses between tabs and the worker: the plain, structured-cloneable parts of a `Request`, matched to its response by `id`.

```ts
export interface IBffRequestEnvelope {
    id: string;
    method: string;
    url: string;
    headers: TEnvelopeHeaders;
    /** Buffered, never a stream - `ReadableStream` does not transfer in Safari. */
    body?: ArrayBuffer;
}
```

Source: `packages/core-worker/src/envelope/common/types.ts`

## `IBffResponseEnvelope`

*interface*

A response as it crosses between the worker and tabs, matched to its request by `id`.

```ts
export interface IBffResponseEnvelope {
    id: string;
    status: number;
    statusText?: string;
    headers: TEnvelopeHeaders;
    body?: ArrayBuffer;
}
```

Source: `packages/core-worker/src/envelope/common/types.ts`

## `IBffTransport`

*interface*

The contract a BFF transport fulfils: turns a `Request` into a `Response`, wherever the server runs.

```ts
export interface IBffTransport {
    fetch(opts: {
        request: Request;
    }): Promise<Response>;
}
```

Source: `packages/core-worker/src/transport/common/types.ts`

## `IInstallBffFetchOptions`

*interface*

Options for replacing `fetch` so matching requests go to a BFF transport.

```ts
export interface IInstallBffFetchOptions {
    /** Anything implementing the transport contract, so an in-process transport works in a test. */
    transport: IBffTransport;
    /**
     * Path prefixes the BFF owns, matched on a segment boundary: `/api` claims `/api` and `/api/...`,
     * never `/apix`. Everything else is passed to the original `fetch` untouched.
     */
    basePath: string | Array<string>;
    /**
     * The origin, or origins, the BFF answers for - the page's own, or an upstream gateway whose
     * calls the BFF stands in for. A request to any other origin goes to the network whatever its path.
     * Unset, only the path decides, so a call to ANY origin under `basePath` is claimed.
     */
    origin?: string | Array<string>;
    /** @default globalThis */
    carrier?: IFetchCarrier;
}

/** The carrier whose `fetch` is replaced - `globalThis` in a page, an object a test controls otherwise. */
interface IFetchCarrier {
    fetch: TFetch;
}

type TFetch = typeof globalThis.fetch;
```

Source: `packages/core-worker/src/transport/fetch-bridge.ts`

## `InProcessBffTransport`

*class*

No worker, no browser - the seam that makes a BFF testable in-process. It still runs the full
envelope round trip, and that is the whole point: a bare pass-through lets a route pass here and
hang over a real Worker, because only the envelope applies the synthetic origin, buffers a
streaming body, and reduces a thrown error to `{ text, code, args }`. A test is worth what its
differences from production are worth.

What it deliberately does NOT mirror is the timeout: in-process there is no message that can be
lost, so a handler either settles or the caller's own test timeout fires.

```ts
export declare class InProcessBffTransport extends BaseHelper implements IBffTransport {
    private readonly handler;
    private readonly requestIdGenerator;
    constructor(opts: {
        handler: (request: Request) => Promise<Response>;
    });
    fetch(opts: {
        request: Request;
    }): Promise<Response>;
}
```

Source: `packages/core-worker/src/transport/in-process.ts`

## `ISharedBffTransportOptions`

*interface*

Options for the transport that shares one worker across tabs through a leader election.

```ts
export interface ISharedBffTransportOptions {
    /** Builds the Worker. Called ONLY by whichever tab wins the election - the others never start one. */
    createWorker: () => Worker;
    /** Distinguishes independent BFFs on one origin. The lock name is derived from it. */
    channelName?: string;
    timeoutMs?: number;
    scope?: string;
}
```

Source: `packages/core-worker/src/transport/shared/common/types.ts`

## `IWorkerApplicationConfigs`

*interface*

What a Web Worker host configures on top of the kernel's shape. `host`/`port` stay off this
interface on purpose - `@venizia/ignis`'s `IServerApplicationConfigs` is the one with a socket.

```ts
export interface IWorkerApplicationConfigs extends IApplicationConfigs {
    /**
     * Bound as `CoreBindings.APPLICATION_PROJECT_ROOT` when `getProjectRoot()` resolves it, and shared with `ModuleUtility`.
     *
     * @default the host's working directory (`process.cwd()`) when one exists, else `''`
     */
    projectRoot?: string;
}
```

Source: `packages/core-worker/src/applications/common/types.ts`

## `IWorkerMessageScope`

*interface*

Structural shape of the two globals `listen()` can attach to. Never `DedicatedWorkerGlobalScope`:
naming it emits it into the published `.d.ts` and forces every consumer to compile with
`lib.webworker`. `start` is optional because a `MessagePort`s queue starts disabled and only
`start()` enables it, while a worker global scope has no such method at all.

```ts
export interface IWorkerMessageScope {
    postMessage(message: unknown, transfer?: Array<ArrayBuffer | MessagePort>): void;
    addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
    removeEventListener?(type: 'message', listener: (event: MessageEvent) => void): void;
    start?(): void;
}
```

Source: `packages/core-worker/src/applications/worker.ts`

## `SharedBffTransport`

*class*

One BFF for every tab of an origin, instead of one per tab.

The problem it solves is not a framework limitation, it is a storage one. PGlite in
`opfs-ahp://` mode holds an exclusive access handle on the database file, and OPFS access handles
are exclusive PER ORIGIN. Measured in Chromium with two tabs of the same page: the first tab
works, and the second never boots its database -
`Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be
created if there is another open Access Handle or Writable stream associated with the same file`.
The first tab is unaffected, and closing it lets the second recover on reload - so the failure is
contained and self-healing, but the second tab is simply dead until then.

So exactly one tab may own the database. This transport elects that tab with the Web Locks API,
gives it the Worker, and forwards every other tab's request to it over a `BroadcastChannel`,
carried in the same envelope the Worker itself speaks. When the leader's tab closes, the lock is
released by the browser and a follower is promoted automatically - no heartbeat, no timeout, no
stale-leader window to reason about.

A host with no `navigator.locks` runs single-tab, exactly as before. That is not a compromise:
measured on a plain-http origin, `navigator.locks` and `navigator.storage.getDirectory` are BOTH
undefined, because both are secure-context only. Wherever OPFS works the lock exists, and where it
does not the database could not have started either.

```ts
export declare class SharedBffTransport extends BaseHelper implements IBffTransport {
    private readonly createWorker;
    private readonly channel;
    private readonly lockName;
    private readonly timeoutMs;
    private readonly requestIdGenerator;
    private readonly pendingRequests;
    private role;
    private leaderTransport?;
    private isClosed;
    /**
     * Held because THIS class created it. `WorkerBffTransport.close()` deliberately leaves a worker
     * running - it did not create the one it was handed - so without this reference the worker would
     * outlive `close()` still holding the exclusive OPFS access handle, while the lock has already
     * gone to another tab that opens the same database.
     */
    private leaderWorker?;
    /** Set when `createWorker()` throws, so callers get that failure instead of parking forever. */
    private leaderStartupError?;
    /** Resolving this releases the Web Lock, which is what promotes a follower. */
    private releaseLeadership?;
    /** Drops this tab out of the lock QUEUE on close, so a closed transport cannot be promoted. */
    private readonly leadershipQueueAbort;
    /** Callers parked in `fetch()` while the election is still running. */
    private roleWaiters;
    constructor(opts: ISharedBffTransportOptions);
    getRole(): TBffRole;
    fetch(opts: {
        request: Request;
    }): Promise<Response>;
    close(): void;
    private elect;
    private becomeLeader;
    private becomeFollower;
    private heldUntilClosed;
    private whenRoleSettled;
    private settleRoleWaiters;
    /**
     * The caller's `AbortSignal` is honoured HERE as well as in `WorkerBffTransport`. Without it the
     * same page code behaves differently depending on which tab won the lock: abort works in the
     * leader and silently does nothing in every follower, so a data provider that aborts on unmount
     * leaves promises pending for the full timeout in every tab but one.
     *
     * Aborting settles the CALLER. It does not cancel the leader's work - there is no cancel message,
     * and a write already dispatched cannot be taken back.
     */
    private fetchViaLeader;
    /** `signal.reason` first, the way `globalThis.fetch` rejects, so a custom abort reason survives. */
    private toAbortError;
    private takePending;
    private rejectAllPending;
    /**
     * A `BroadcastChannel` never delivers a message to the instance that sent it, so a leader does not
     * hear its own answers and a follower does not hear its own requests. Every tab does hear every
     * OTHER tab, which is why a response is matched by id and silently ignored when it belongs to
     * someone else.
     */
    private readonly handleChannelMessage;
    private serveAsLeader;
}
```

Source: `packages/core-worker/src/transport/shared/transport.ts`

## `TBffRole`

*type*

One of the `BffRoles` values: `electing`, `leader` or `follower`.

```ts
export type TBffRole = TConstValue<typeof BffRoles>;
```

Source: `packages/core-worker/src/transport/shared/common/types.ts`

## `TEnvelopeHeaders`

*type*

Headers are carried as tuples: a `Headers` instance is not structured-cloneable.

```ts
export type TEnvelopeHeaders = Array<[string, string]>;
```

Source: `packages/core-worker/src/envelope/common/types.ts`

## `WorkerApplication`

*class*

Runs an IGNIS application inside a browser Web Worker: `listen()` replaces what
`ServerApplication.start()` does with a socket, attaching `onmessage` instead. Gets REST
controller registration by inheritance - `RestApplication.registerControllers()` - the whole
reason the DI helpers and `RestComponent` sit in the kernel.

```ts
export declare abstract class WorkerApplication<AppEnv extends Env = Env, AppSchema extends Schema = {}, BasePath extends string = '/'> extends RestApplication<AppEnv, AppSchema, BasePath> {
    /** Widened by this layer, the only one with an optional `projectRoot` to read. Assigned by the base constructor - `declare` so no field initializer runs here and overwrites it with `undefined`. */
    protected configs: IWorkerApplicationConfigs;
    /** Resolves once the router tree is mounted - what an envelope arriving during boot waits on. */
    private servingPromise?;
    /** The whole `listen()` call, kept so a second one is a no-op instead of a second listener. */
    private listenPromise?;
    private detachFromScope?;
    private isStopped;
    /**
     * `configs.projectRoot` wins, else the host's own working directory - read as
     * `globalThis.process?.cwd?.()`, never a bare `process.cwd()`, because a real browser Worker has no
     * such global and this class ships there. Bound AND shared with `ModuleUtility` (through the
     * purity-safe `ProjectRootRegistry`), the same seam `ServerApplication` gives a socket host. No
     * `node_modules` check here, unlike that host: a browser has no filesystem to check, and `node:fs`
     * would bundle a Node builtin straight into a Worker.
     */
    getProjectRoot(): string;
    /**
     * Every failure here is posted back as an `IBffErrorEnvelope`, the failed `postMessage` included:
     * an exception nobody posts leaves the UI waiting out the transport timeout.
     */
    private handleMessage;
    /** No transfer list: an error envelope carries no `ArrayBuffer` body, and this is already the fallback path - nothing left to hand off if this post fails too. */
    private postErrorEnvelope;
    /** Everything `ServerApplication.start()` does short of binding a socket. Once this resolves the application answers requests. */
    private startServing;
    /**
     * Holds an envelope until the application is serving. A dedicated worker's queue is enabled when
     * its module script is evaluated, so anything posted during boot - PGlite takes ~350ms - reaches
     * this listener and would otherwise be dropped. One shared promise also hands them on in arrival
     * order.
     */
    private dispatchMessage;
    private attachTo;
    /**
     * `ServerApplication.start()` minus the socket. `opts.scope` defaults to `globalThis`, never a
     * bare `self`, which would tie the published types to `lib.webworker`. Idempotent: without the
     * guard one envelope runs its handler once per call - a POST inserting two rows - and Vite HMR
     * re-evaluating the worker module is the everyday trigger. A boot failure keeps the listener
     * attached so every request hears the failure instead of waiting out the transport timeout.
     */
    listen(opts?: {
        scope?: MessagePort | IWorkerMessageScope;
    }): Promise<void>;
    /**
     * The counterpart to `listen()`, and to `ServerApplication.stop()`: runs the post-stop hooks, then
     * closes every datasource the boot configured. Without it the OPFS exclusive lock a PGlite holds
     * is never released - the next Worker then fails with `NoModificationAllowedError` until a full
     * page reload. The Vite recipe is `import.meta.hot?.dispose(() => application.stop())`.
     *
     * Detaches BEFORE draining, unlike the server: here the listener IS the socket, and a request
     * admitted while a datasource is closing has nothing left to run against. A stopped application
     * is not restartable - build a new one.
     */
    stop(): Promise<void>;
}
```

Source: `packages/core-worker/src/applications/worker.ts`

## `WorkerBffTransport`

*class*

UI-side half of the BFF: posts an encoded request to a real `Worker` and resolves the matching
response by `id` - the far side of `WorkerApplication.listen()`.

The three worker listeners are attached ONCE, in the constructor, and every request is tracked in
`pendingRequests` instead. Registering them per request looks equivalent and is not: they are
scoped to the shared `Worker`, so a single `messageerror` - which means exactly one message
failed to deserialise - would fire every in-flight request's handler, rejecting nine healthy
requests that are about to be answered normally.

```ts
export declare class WorkerBffTransport extends BaseHelper implements IBffTransport {
    private readonly worker;
    private readonly timeoutMs;
    private readonly requestIdGenerator;
    private readonly pendingRequests;
    /** Set by `close()`, so a later `fetch()` is refused instead of reaching a worker nothing listens to. */
    private isClosed;
    /** Outstanding `handleWorkerError` grace timers, cleared by `close()` so none outlives the transport. */
    private readonly graceTimers;
    constructor(opts: {
        worker: Worker;
        timeoutMs?: number;
    });
    /** Removes a pending request from the map and releases its timer and abort listener, so nothing can settle it twice. */
    private readonly takePending;
    private readonly handleMessage;
    /**
     * An `error` event does NOT mean the worker is dead.
     *
     * Measured in Chromium: a synchronous uncaught throw anywhere in the worker - a third-party timer,
     * say - fires this event while the worker keeps serving, and the genuine responses to the
     * in-flight requests arrive a moment later. Rejecting immediately reported a committed POST as
     * failed and then dropped its real 200 on the floor, because nothing was left waiting for it.
     *
     * So the event is logged at once and the requests are given a grace window. Whatever the worker
     * still answers inside it settles normally; whatever is left after it really is lost, and is
     * rejected with the diagnostics rather than left to run out its own timeout.
     */
    private readonly handleWorkerError;
    /** `ErrorEvent` carries the useful fields; a plain `Event` does not, so both shapes are handled. */
    private describeErrorEvent;
    /**
     * `messageerror` means exactly ONE posted message failed to deserialise, and the event carries
     * nothing that says which. With a single request in flight that is unambiguous, so it settles
     * now; with several, the lost answer belongs to one of them and rejecting the rest would be a
     * lie - each then ends on its own timeout, under its own id.
     */
    private readonly handleMessageError;
    fetch(opts: {
        request: Request;
    }): Promise<Response>;
    /** `signal.reason` first, the way `globalThis.fetch` rejects, so `controller.abort(myReason)` still reaches the caller. */
    private toAbortError;
    /**
     * Detaches the three worker listeners and fails whatever is still in flight. The worker itself is
     * left alone - this transport did not create it, and a page may hand the same one to another.
     */
    close(): void;
}
```

Source: `packages/core-worker/src/transport/worker.ts`

import { BaseHelper, getError, RequestIdGenerator } from '@venizia/ignis-helpers/core';
import { BffEnvelope } from '@/envelope/encode';
import type { IBffRequestEnvelope } from '@/envelope/common';
import type { IBffTransport } from '../common/types';
import { WorkerBffTransport } from '../worker';
import { BffRoles, ChannelMessageKinds, DEFAULT_CHANNEL_NAME, DEFAULT_TIMEOUT_MS } from './common';
import type {
  IPendingRequest,
  ISharedBffTransportOptions,
  TBffRole,
  TChannelMessage,
} from './common';

/**
 * One BFF for every tab of an origin, instead of one per tab.
 *
 * The problem it solves is not a framework limitation, it is a storage one. PGlite in
 * `opfs-ahp://` mode holds an exclusive access handle on the database file, and OPFS access handles
 * are exclusive PER ORIGIN. Measured in Chromium with two tabs of the same page: the first tab
 * works, and the second never boots its database -
 * `Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be
 * created if there is another open Access Handle or Writable stream associated with the same file`.
 * The first tab is unaffected, and closing it lets the second recover on reload - so the failure is
 * contained and self-healing, but the second tab is simply dead until then.
 *
 * So exactly one tab may own the database. This transport elects that tab with the Web Locks API,
 * gives it the Worker, and forwards every other tab's request to it over a `BroadcastChannel`,
 * carried in the same envelope the Worker itself speaks. When the leader's tab closes, the lock is
 * released by the browser and a follower is promoted automatically - no heartbeat, no timeout, no
 * stale-leader window to reason about.
 *
 * A host with no `navigator.locks` runs single-tab, exactly as before. That is not a compromise:
 * measured on a plain-http origin, `navigator.locks` and `navigator.storage.getDirectory` are BOTH
 * undefined, because both are secure-context only. Wherever OPFS works the lock exists, and where it
 * does not the database could not have started either.
 */
export class SharedBffTransport extends BaseHelper implements IBffTransport {
  private readonly createWorker: () => Worker;
  private readonly channel: BroadcastChannel;
  private readonly lockName: string;
  private readonly timeoutMs: number;
  private readonly requestIdGenerator: RequestIdGenerator;
  private readonly pendingRequests = new Map<string, IPendingRequest>();

  private role: TBffRole = BffRoles.ELECTING;
  private leaderTransport?: WorkerBffTransport;
  private isClosed = false;

  /**
   * Held because THIS class created it. `WorkerBffTransport.close()` deliberately leaves a worker
   * running - it did not create the one it was handed - so without this reference the worker would
   * outlive `close()` still holding the exclusive OPFS access handle, while the lock has already
   * gone to another tab that opens the same database.
   */
  private leaderWorker?: Worker;

  /** Set when `createWorker()` throws, so callers get that failure instead of parking forever. */
  private leaderStartupError?: unknown;

  /** Resolving this releases the Web Lock, which is what promotes a follower. */
  private releaseLeadership?: () => void;

  /** Drops this tab out of the lock QUEUE on close, so a closed transport cannot be promoted. */
  private readonly leadershipQueueAbort = new AbortController();

  /** Callers parked in `fetch()` while the election is still running. */
  private roleWaiters: Array<() => void> = [];

  constructor(opts: ISharedBffTransportOptions) {
    super({ scope: opts.scope ?? SharedBffTransport.name });

    const channelName = opts.channelName ?? DEFAULT_CHANNEL_NAME;

    this.createWorker = opts.createWorker;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.lockName = `${channelName}.leader`;
    this.requestIdGenerator = new RequestIdGenerator({ scope: SharedBffTransport.name });

    // Attached BEFORE the election starts: a tab that becomes leader a moment later must not miss a
    // request a follower posted while it was still deciding.
    this.channel = new BroadcastChannel(channelName);
    this.channel.addEventListener('message', this.handleChannelMessage);

    // A failed election must not leave `fetch()` parked forever waiting for a role that never
    // arrives: this tab falls back to serving itself, which is the pre-election behaviour.
    this.elect().catch((error: unknown) => {
      // `close()` aborts the queued lock request, and the rejection that produces is the expected
      // end of the election - not a failure to report.
      if (this.isClosed) {
        return;
      }

      this.logger
        .for(this.elect.name)
        .error('Leader election failed, falling back to single-tab | error: %s', error);

      if (this.role === BffRoles.ELECTING) {
        this.becomeLeader();
      }
    });
  }

  getRole(): TBffRole {
    return this.role;
  }

  async fetch(opts: { request: Request }): Promise<Response> {
    if (this.isClosed) {
      throw getError({
        message: '[SharedBffTransport] The transport is closed | open a new one to make requests',
      });
    }

    await this.whenRoleSettled();

    // Re-checked AFTER the await: `close()` can land while the election is still running, and
    // posting then reaches a channel that is already closed - the caller would get a raw
    // `DOMException` instead of this error, and a pending entry plus a live timer would be left
    // behind on a transport nothing can settle.
    if (this.isClosed) {
      throw getError({
        message: '[SharedBffTransport] The transport is closed | open a new one to make requests',
      });
    }

    if (this.leaderStartupError) {
      throw getError({
        message:
          '[SharedBffTransport] This tab leads but its BFF worker never started | reload the page',
        cause: this.leaderStartupError,
      });
    }

    if (this.role === BffRoles.LEADER && this.leaderTransport) {
      return this.leaderTransport.fetch(opts);
    }

    return this.fetchViaLeader(opts);
  }

  close(): void {
    this.isClosed = true;

    // A follower is parked in the lock QUEUE rather than holding anything. Without this it stays
    // queued after close, and the browser would eventually hand leadership to a dead transport -
    // which returns straight away, but only after the tab that could have served was skipped.
    this.leadershipQueueAbort.abort();

    // ORDER IS THE POINT, and it is the opposite of the obvious one. The worker has to be GONE
    // before the lock is released: releasing first promotes another tab, which opens the same OPFS
    // database while this worker still holds the exclusive access handle - the exact failure this
    // transport exists to prevent, reintroduced by its own teardown.
    //
    // `terminate()` is abrupt by design. It is no worse than the tab-close path the browser already
    // takes on every leader, and leaving the worker alive is strictly worse than an abrupt stop.
    this.leaderTransport?.close();
    this.leaderTransport = undefined;
    this.leaderWorker?.terminate();
    this.leaderWorker = undefined;

    // Only now: the next tab may open the database.
    this.releaseLeadership?.();
    this.releaseLeadership = undefined;

    this.channel.removeEventListener('message', this.handleChannelMessage);
    this.channel.close();

    this.rejectAllPending({ reason: 'the transport was closed' });
    this.settleRoleWaiters();
  }

  private async elect(): Promise<void> {
    const locks = globalThis.navigator?.locks;

    if (!locks) {
      this.logger
        .for(this.elect.name)
        .warn(
          'navigator.locks is unavailable - running single-tab | a second tab cannot open the same OPFS database',
        );
      this.becomeLeader();
      return;
    }

    // `ifAvailable` answers NOW instead of queueing, which is what lets this tab find out it is a
    // follower rather than hanging until the current leader goes away.
    const hasWon = await locks.request(this.lockName, { ifAvailable: true }, async lock => {
      if (!lock) {
        return false;
      }

      // Symmetric with the queued branch below, and not defensive padding. A real `LockManager`
      // grants from a queued task - it never runs this callback synchronously inside `request()` -
      // so `close()` can land between the constructor and this line. Without the guard a CLOSED
      // transport starts a worker, reports itself leader, and then holds the lock for the lifetime
      // of the page: `close()` has already read and cleared `releaseLeadership`, so the assignment
      // `heldUntilClosed()` makes below can never be resolved by anything. No other tab is ever
      // promoted, and this one answers nobody - its channel listener is already detached.
      //
      // Returning true, not false: this tab DID hold the lock. Returning releases it immediately,
      // which is exactly what a closed transport should do with it.
      if (this.isClosed) {
        return true;
      }

      this.becomeLeader();
      await this.heldUntilClosed();
      return true;
    });

    if (hasWon || this.isClosed) {
      return;
    }

    this.becomeFollower();

    // Queues behind the current leader. The browser releases its lock when that tab goes away - a
    // crash included - so this resolves without anything having to detect the death.
    await locks.request(this.lockName, { signal: this.leadershipQueueAbort.signal }, async () => {
      if (this.isClosed) {
        return;
      }

      this.logger
        .for(this.elect.name)
        .info('Promoted to leader | previous leader released the lock');
      this.becomeLeader();
      await this.heldUntilClosed();
    });
  }

  private becomeLeader(): void {
    // Anything this tab had in flight was addressed to the leader that just went away. It cannot be
    // replayed - a write may well have been applied - so it is failed explicitly rather than left
    // to run out its timeout under a leader that will never answer it.
    this.rejectAllPending({
      reason: 'the leader serving it went away before this tab was promoted',
    });

    try {
      this.leaderWorker = this.createWorker();
      this.leaderTransport = new WorkerBffTransport({
        worker: this.leaderWorker,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      // A CSP refusal or a bad worker URL must still SETTLE the role. `whenRoleSettled()` has no
      // timeout of its own and the per-request timer is armed only inside `fetchViaLeader()`, which
      // this tab never reaches - so leaving the role unsettled hangs every caller forever, with no
      // error and no log per request.
      this.leaderStartupError = error;
      this.logger
        .for(this.becomeLeader.name)
        .error('Could not start the BFF worker | error: %s', error);
    }

    this.role = BffRoles.LEADER;
    this.settleRoleWaiters();
  }

  private becomeFollower(): void {
    this.role = BffRoles.FOLLOWER;
    this.settleRoleWaiters();
  }

  private heldUntilClosed(): Promise<void> {
    return new Promise<void>(resolve => {
      this.releaseLeadership = resolve;
    });
  }

  private whenRoleSettled(): Promise<void> {
    if (this.role !== BffRoles.ELECTING) {
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      this.roleWaiters.push(resolve);
    });
  }

  private settleRoleWaiters(): void {
    const waiters = this.roleWaiters;
    this.roleWaiters = [];

    for (const waiter of waiters) {
      waiter();
    }
  }

  /**
   * The caller's `AbortSignal` is honoured HERE as well as in `WorkerBffTransport`. Without it the
   * same page code behaves differently depending on which tab won the lock: abort works in the
   * leader and silently does nothing in every follower, so a data provider that aborts on unmount
   * leaves promises pending for the full timeout in every tab but one.
   *
   * Aborting settles the CALLER. It does not cancel the leader's work - there is no cancel message,
   * and a write already dispatched cannot be taken back.
   */
  private async fetchViaLeader(opts: { request: Request }): Promise<Response> {
    const { signal } = opts.request;

    if (signal?.aborted) {
      throw this.toAbortError({ signal });
    }

    const id = this.requestIdGenerator.nextId();

    const envelope = await BffEnvelope.encodeRequest({
      request: opts.request,
      id,
      url: BffEnvelope.toSyntheticUrl({ url: opts.request.url }),
    });

    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.takePending({ id })?.reject(
          getError({
            message: `[SharedBffTransport] Timed out waiting for the leader tab | id: ${id} | timeoutMs: ${this.timeoutMs}`,
          }),
        );
      }, this.timeoutMs);

      const handleAbort = (): void => {
        this.takePending({ id })?.reject(this.toAbortError({ signal }));
      };
      signal?.addEventListener('abort', handleAbort);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        release: () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', handleAbort);
        },
      });

      // Buffering the body took an await, and `addEventListener('abort')` never fires on a signal
      // that aborted before it was attached - without this re-read that window loses the abort.
      if (signal?.aborted) {
        handleAbort();
        return;
      }

      this.channel.postMessage({
        kind: ChannelMessageKinds.REQUEST,
        envelope,
      } satisfies TChannelMessage);
    });
  }

  /** `signal.reason` first, the way `globalThis.fetch` rejects, so a custom abort reason survives. */
  private toAbortError(opts: { signal?: AbortSignal }): unknown {
    return (
      opts.signal?.reason ??
      getError({ message: '[SharedBffTransport] The request was aborted by its caller' })
    );
  }

  private takePending(opts: { id: string }): IPendingRequest | undefined {
    const pending = this.pendingRequests.get(opts.id);
    if (!pending) {
      return undefined;
    }

    this.pendingRequests.delete(opts.id);
    pending.release();
    return pending;
  }

  private rejectAllPending(opts: { reason: string }): void {
    for (const id of [...this.pendingRequests.keys()]) {
      this.takePending({ id })?.reject(
        getError({
          message: `[SharedBffTransport] Request abandoned | id: ${id} | reason: ${opts.reason}`,
        }),
      );
    }
  }

  /**
   * A `BroadcastChannel` never delivers a message to the instance that sent it, so a leader does not
   * hear its own answers and a follower does not hear its own requests. Every tab does hear every
   * OTHER tab, which is why a response is matched by id and silently ignored when it belongs to
   * someone else.
   */
  private readonly handleChannelMessage = (event: MessageEvent): void => {
    const message = event.data as TChannelMessage | undefined;

    switch (message?.kind) {
      case ChannelMessageKinds.REQUEST: {
        if (this.role !== BffRoles.LEADER) {
          return;
        }

        // `serveAsLeader` answers its own failures on the channel; this catch is for the one case
        // it cannot - the channel itself refusing the message, e.g. a body that will not clone.
        this.serveAsLeader({ envelope: message.envelope }).catch((error: unknown) => {
          this.logger
            .for(this.serveAsLeader.name)
            .error(
              'Could not answer a follower at all | id: %s | error: %s',
              message.envelope.id,
              error,
            );
        });
        return;
      }

      // Both decodes are guarded. The channel is origin-wide and its name is the application's, not
      // a secret, and version skew is the realistic trigger: a long-lived tab on v1 and a new tab
      // on v2 share the same channel and lock BY DESIGN. An envelope this build cannot read must
      // fail its caller, never leave the promise unsettled for the full timeout.
      case ChannelMessageKinds.RESPONSE: {
        const pending = this.takePending({ id: message.envelope.id });
        if (!pending) {
          return;
        }

        try {
          pending.resolve(BffEnvelope.decodeResponse({ envelope: message.envelope }));
        } catch (error) {
          this.logger
            .for(this.handleChannelMessage.name)
            .error(
              'Undecodable response envelope | id: %s | error: %s',
              message.envelope.id,
              error,
            );
          pending.reject(
            getError({
              message: `[SharedBffTransport] The leader's response could not be decoded | id: ${message.envelope.id}`,
              cause: error,
            }),
          );
        }
        return;
      }

      case ChannelMessageKinds.ERROR: {
        const pending = this.takePending({ id: message.envelope.id });
        if (!pending) {
          return;
        }

        try {
          pending.reject(BffEnvelope.decodeError({ envelope: message.envelope }));
        } catch (error) {
          pending.reject(
            getError({
              message: `[SharedBffTransport] The leader's error envelope could not be decoded | id: ${message.envelope.id}`,
              cause: error,
            }),
          );
        }
        return;
      }

      default: {
        return;
      }
    }
  };

  private async serveAsLeader(opts: { envelope: IBffRequestEnvelope }): Promise<void> {
    const { envelope } = opts;

    try {
      const response = await this.leaderTransport!.fetch({
        request: BffEnvelope.decodeRequest({ envelope }),
      });

      this.channel.postMessage({
        kind: ChannelMessageKinds.RESPONSE,
        envelope: await BffEnvelope.encodeResponse({ response, id: envelope.id }),
      } satisfies TChannelMessage);
    } catch (error) {
      // The follower gets the failure as a failure, rather than waiting out a timeout that would
      // tell it nothing about what went wrong.
      this.logger
        .for(this.serveAsLeader.name)
        .error('Failed to serve a follower request | id: %s | error: %s', envelope.id, error);

      this.channel.postMessage({
        kind: ChannelMessageKinds.ERROR,
        envelope: BffEnvelope.encodeError({ id: envelope.id, error }),
      } satisfies TChannelMessage);
    }
  }
}

import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { RestApplication } from '@venizia/ignis-kernel';
import type { Env, Schema } from 'hono';
import { BffEnvelope } from '@/envelope/encode';
import type { IBffRequestEnvelope, IBffResponseEnvelope } from '@/envelope/types';

/**
 * Structural shape of the two globals `listen()` can attach to. Never `DedicatedWorkerGlobalScope`:
 * naming it emits it into the published `.d.ts` and forces every consumer to compile with
 * `lib.webworker`. `start` is optional because a `MessagePort`s queue starts disabled and only
 * `start()` enables it, while a worker global scope has no such method at all.
 */
export interface IWorkerMessageScope {
  postMessage(message: unknown, transfer?: Array<ArrayBuffer | MessagePort>): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener?(type: 'message', listener: (event: MessageEvent) => void): void;
  start?(): void;
}

/**
 * Runs an IGNIS application inside a browser Web Worker: `listen()` replaces what
 * `ServerApplication.start()` does with a socket, attaching `onmessage` instead. Gets REST
 * controller registration by inheritance - `RestApplication.registerControllers()` - the whole
 * reason the DI helpers and `RestComponent` sit in the kernel.
 */
export abstract class WorkerApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
> extends RestApplication<AppEnv, AppSchema, BasePath> {
  /** Resolves once the router tree is mounted - what an envelope arriving during boot waits on. */
  private servingPromise?: Promise<void>;
  /** The whole `listen()` call, kept so a second one is a no-op instead of a second listener. */
  private listenPromise?: Promise<void>;
  private detachFromScope?: () => void;
  private isStopped = false;

  /**
   * Every failure here is posted back as an `IBffErrorEnvelope`, the failed `postMessage` included:
   * an exception nobody posts leaves the UI waiting out the transport timeout.
   */
  private async handleMessage(opts: {
    scope: MessagePort | IWorkerMessageScope;
    envelope: IBffRequestEnvelope;
  }): Promise<void> {
    const { scope, envelope } = opts;
    const logger = this.logger.for(this.handleMessage.name);

    let responseEnvelope: IBffResponseEnvelope | undefined;
    let failure: unknown;

    try {
      const request = BffEnvelope.decodeRequest({ envelope });
      const response = await this.getServer().fetch(request);
      responseEnvelope = await BffEnvelope.encodeResponse({ response, id: envelope.id });
    } catch (error) {
      logger.error('Failed to handle worker message | id: %s | error: %s', envelope.id, error);
      failure = error;
    }

    if (responseEnvelope) {
      try {
        scope.postMessage(responseEnvelope, responseEnvelope.body ? [responseEnvelope.body] : []);
        return;
      } catch (postError) {
        logger.error(
          'Failed to post response back to scope, falling back to an error envelope | id: %s | error: %s',
          envelope.id,
          postError,
        );
        failure = postError;
      }
    }

    this.postErrorEnvelope({ scope, id: envelope.id, error: failure });
  }

  /** No transfer list: an error envelope carries no `ArrayBuffer` body, and this is already the fallback path - nothing left to hand off if this post fails too. */
  private postErrorEnvelope(opts: {
    scope: MessagePort | IWorkerMessageScope;
    id: string;
    error: unknown;
  }): void {
    const { scope, id, error } = opts;

    try {
      scope.postMessage(BffEnvelope.encodeError({ id, error }));
    } catch (postError) {
      this.logger
        .for(this.postErrorEnvelope.name)
        .error('Failed to post error envelope back to scope | id: %s | error: %s', id, postError);
    }
  }

  /** Everything `ServerApplication.start()` does short of binding a socket. Once this resolves the application answers requests. */
  private async startServing(): Promise<void> {
    // The stack itself is `RestApplication.registerDefaultMiddlewares()` - a BFF must answer with
    // the framework's envelope exactly as the server does, so it adds nothing and overrides nothing.
    await this.registerDefaultMiddlewares();

    await this.initialize();
    await this.setupMiddlewares();

    this.getServer().route(this.configs.path.base, this.rootRouter);
  }

  /**
   * Holds an envelope until the application is serving. A dedicated worker's queue is enabled when
   * its module script is evaluated, so anything posted during boot - PGlite takes ~350ms - reaches
   * this listener and would otherwise be dropped. One shared promise also hands them on in arrival
   * order.
   */
  private async dispatchMessage(opts: {
    scope: MessagePort | IWorkerMessageScope;
    envelope: IBffRequestEnvelope;
  }): Promise<void> {
    const { scope, envelope } = opts;
    const logger = this.logger.for(this.dispatchMessage.name);

    try {
      await this.servingPromise;
    } catch (error) {
      logger.error(
        'The application failed to start, answering with an error envelope | id: %s | error: %s',
        envelope.id,
        error,
      );
      this.postErrorEnvelope({ scope, id: envelope.id, error });
      return;
    }

    // Answered, not dropped: a request admitted before `stop()` and still waiting on the boot has
    // a caller holding a promise, and silence there is the timeout this whole path exists to avoid.
    if (this.isStopped) {
      logger.warn('Refusing a request that arrived after stop() | id: %s', envelope.id);
      this.postErrorEnvelope({
        scope,
        id: envelope.id,
        error: getError({
          statusCode: HTTP.ResultCodes.RS_5.ServiceUnavailable,
          message: `[WorkerApplication] The application was stopped before this request could run | id: ${envelope.id}`,
        }),
      });
      return;
    }

    await this.handleMessage({ scope, envelope });
  }

  private attachTo(opts: { scope: MessagePort | IWorkerMessageScope }): void {
    const { scope } = opts;
    const logger = this.logger.for(this.attachTo.name);

    // Typed as the broader `Event`, not `MessageEvent`: Node's ambient `worker_threads.MessagePort`
    // (the fallback this package's DOM-less tsconfig resolves `MessagePort` to) declares
    // `addEventListener` over `Event | MessageEvent`, and a handler narrower than that is not
    // assignable to it.
    const listener = (event: Event): void => {
      const envelope = (event as MessageEvent).data as IBffRequestEnvelope | undefined;

      // A worker scope receives every `postMessage` sent to it, not only ours - a dev-server ping,
      // a devtools/extension probe, a library's own init handshake. None of those carry an `id`;
      // silently dropping them (rather than dereferencing `envelope.id` inside `handleMessage`'s
      // own catch block) is what keeps a foreign message from throwing a bare `TypeError` that
      // would otherwise escape this listener entirely, unlogged and unposted.
      if (!envelope?.id) {
        logger.debug('Ignoring worker message with no request id | data: %j', envelope);
        return;
      }

      // `dispatchMessage` never rejects - every failure inside it, including a failed post, is
      // caught and handled internally. This `.catch` only guards the sliver of code before its own
      // try block ever runs.
      this.dispatchMessage({ scope, envelope }).catch(error => {
        logger.error('Unexpected failure handling worker message | error: %s', error);
      });
    };

    scope.addEventListener('message', listener);

    scope.start?.();

    this.detachFromScope = () => {
      scope.removeEventListener?.('message', listener);
    };
  }

  /**
   * `ServerApplication.start()` minus the socket. `opts.scope` defaults to `globalThis`, never a
   * bare `self`, which would tie the published types to `lib.webworker`. Idempotent: without the
   * guard one envelope runs its handler once per call - a POST inserting two rows - and Vite HMR
   * re-evaluating the worker module is the everyday trigger. A boot failure keeps the listener
   * attached so every request hears the failure instead of waiting out the transport timeout.
   */
  async listen(opts?: { scope?: MessagePort | IWorkerMessageScope }): Promise<void> {
    if (this.listenPromise) {
      this.logger
        .for(this.listen.name)
        .warn('Already listening - ignoring this call | one scope, one listener');
      return this.listenPromise;
    }

    // Everything down to the first `await` runs synchronously with the caller, which is what makes
    // the listener observable to anything posted in the same turn.
    const scope: MessagePort | IWorkerMessageScope =
      opts?.scope ?? (globalThis as IWorkerMessageScope);

    this.attachTo({ scope });

    this.servingPromise = this.startServing();
    this.listenPromise = this.servingPromise.then(() => this.executePostStartHooks());

    return this.listenPromise;
  }

  /**
   * The counterpart to `listen()`, and to `ServerApplication.stop()`: without it nothing drains the
   * post-stop hooks, so a datasource's `end()` never runs and the OPFS exclusive lock a PGlite
   * holds is never released - the next Worker then fails with `NoModificationAllowedError` until a
   * full page reload. The Vite recipe is `import.meta.hot?.dispose(() => application.stop())`.
   *
   * Detaches BEFORE draining, unlike the server: here the listener IS the socket, and a request
   * admitted while the hooks are closing a datasource has nothing left to run against. A stopped
   * application is not restartable - build a new one.
   */
  async stop(): Promise<void> {
    this.isStopped = true;

    this.detachFromScope?.();
    this.detachFromScope = undefined;

    await this.executePostStopHooks();

    this.logger.for(this.stop.name).info('Worker application STOPPED');
  }
}

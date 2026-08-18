import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { RequestIdGenerator } from '@venizia/ignis-helpers/core';
import { BffEnvelope } from '@/envelope/encode';
import type { IBffErrorEnvelope, IBffResponseEnvelope } from '@/envelope/types';
import type { IBffTransport } from './common/types';

const DEFAULT_TIMEOUT_MS = 30_000;

const isErrorEnvelope = (
  data: IBffResponseEnvelope | IBffErrorEnvelope,
): data is IBffErrorEnvelope => {
  return 'error' in data;
};

/** One in-flight request: what settles it, and what has to be released the moment it settles. */
interface IPendingRequest {
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
  release: () => void;
}

/**
 * UI-side half of the BFF: posts an encoded request to a real `Worker` and resolves the matching
 * response by `id` - the far side of `WorkerApplication.listen()`.
 *
 * The three worker listeners are attached ONCE, in the constructor, and every request is tracked in
 * `pendingRequests` instead. Registering them per request looks equivalent and is not: they are
 * scoped to the shared `Worker`, so a single `messageerror` - which means exactly one message
 * failed to deserialise - would fire every in-flight request's handler, rejecting nine healthy
 * requests that are about to be answered normally.
 */
export class WorkerBffTransport extends BaseHelper implements IBffTransport {
  private readonly worker: Worker;
  private readonly timeoutMs: number;
  private readonly requestIdGenerator = new RequestIdGenerator({
    scope: WorkerBffTransport.name,
  });
  private readonly pendingRequests = new Map<string, IPendingRequest>();

  constructor(opts: { worker: Worker; timeoutMs?: number }) {
    super({ scope: WorkerBffTransport.name });

    this.worker = opts.worker;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleWorkerError);
    this.worker.addEventListener('messageerror', this.handleMessageError);
  }

  /** Removes a pending request from the map and releases its timer and abort listener, so nothing can settle it twice. */
  private readonly takePending = (opts: { id: string }): IPendingRequest | undefined => {
    const pending = this.pendingRequests.get(opts.id);
    if (!pending) {
      return undefined;
    }

    this.pendingRequests.delete(opts.id);
    pending.release();
    return pending;
  };

  private readonly handleMessage = (event: MessageEvent): void => {
    // `event.data` is untyped (`any`) until narrowed below - a worker posts to this page for its own
    // reasons too (a dev-server ping, a library handshake), and none of those carry an `id` this
    // transport is waiting on.
    const data = event.data as IBffResponseEnvelope | IBffErrorEnvelope | undefined;
    if (!data?.id) {
      return;
    }

    const pending = this.takePending({ id: data.id });
    if (!pending) {
      return;
    }

    if (isErrorEnvelope(data)) {
      pending.reject(BffEnvelope.decodeError({ envelope: data }));
      return;
    }

    // Settled inside its own try: `decodeResponse` throws a `RangeError` for a status outside
    // 200-599 and a `TypeError` on a malformed header tuple, and by this point the timer and the
    // listeners are already gone - a throw that escaped here would leave the promise with nothing
    // left to settle it, ever.
    try {
      pending.resolve(BffEnvelope.decodeResponse({ envelope: data }));
    } catch (error) {
      pending.reject(
        getError({
          message: `[WorkerBffTransport] Failed to decode the response envelope | id: ${data.id} | error: ${error}`,
        }),
      );
    }
  };

  /**
   * A dead or crashed worker never posts anything back, so every in-flight request is lost - this
   * is the one event that legitimately settles all of them, instead of leaving each to time out.
   */
  private readonly handleWorkerError = (event: Event): void => {
    for (const id of [...this.pendingRequests.keys()]) {
      this.takePending({ id })?.reject(
        getError({
          message: `[WorkerBffTransport] Worker failed while awaiting a response | id: ${id} | event: ${String(event)}`,
        }),
      );
    }
  };

  /**
   * `messageerror` means exactly ONE posted message failed to deserialise, and the event carries
   * nothing that says which. With a single request in flight that is unambiguous, so it settles
   * now; with several, the lost answer belongs to one of them and rejecting the rest would be a
   * lie - each then ends on its own timeout, under its own id.
   */
  private readonly handleMessageError = (event: Event): void => {
    if (this.pendingRequests.size !== 1) {
      this.logger
        .for(this.handleMessageError.name)
        .warn(
          'A worker message could not be deserialised and no single request owns it | inFlight: %d | event: %s',
          this.pendingRequests.size,
          String(event),
        );
      return;
    }

    const [id] = [...this.pendingRequests.keys()];
    this.takePending({ id: id! })?.reject(
      getError({
        message: `[WorkerBffTransport] The worker's response could not be deserialised | id: ${id} | event: ${String(event)}`,
      }),
    );
  };

  async fetch(opts: { request: Request }): Promise<Response> {
    const { request } = opts;
    const { signal } = request;

    if (signal?.aborted) {
      throw this.toAbortError({ signal });
    }

    const id = this.requestIdGenerator.nextId();

    // The URL is overridden rather than the request rebuilt: rebuilding reads the body once here
    // and once inside `encodeRequest`, and it silently drops `signal` on the way.
    const requestEnvelope = await BffEnvelope.encodeRequest({
      request,
      id,
      url: BffEnvelope.toSyntheticUrl({ url: request.url }),
    });

    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.takePending({ id })?.reject(
          getError({
            message: `[WorkerBffTransport] Timed out waiting for a response | id: ${id} | timeoutMs: ${this.timeoutMs}`,
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
      // that aborted before it was attached - without this re-read that window loses the abort and
      // the caller waits out the whole timeout.
      if (signal?.aborted) {
        handleAbort();
        return;
      }

      this.worker.postMessage(requestEnvelope, requestEnvelope.body ? [requestEnvelope.body] : []);
    });
  }

  /** `signal.reason` first, the way `globalThis.fetch` rejects, so `controller.abort(myReason)` still reaches the caller. */
  private toAbortError(opts: { signal?: AbortSignal }): unknown {
    return (
      opts.signal?.reason ??
      getError({ message: '[WorkerBffTransport] The request was aborted by its caller' })
    );
  }

  /**
   * Detaches the three worker listeners and fails whatever is still in flight. The worker itself is
   * left alone - this transport did not create it, and a page may hand the same one to another.
   */
  close(): void {
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleWorkerError);
    this.worker.removeEventListener('messageerror', this.handleMessageError);

    for (const id of [...this.pendingRequests.keys()]) {
      this.takePending({ id })?.reject(
        getError({
          message: `[WorkerBffTransport] The transport was closed while awaiting a response | id: ${id}`,
        }),
      );
    }
  }
}

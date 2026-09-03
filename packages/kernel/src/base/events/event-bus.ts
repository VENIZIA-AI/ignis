import type { Container } from '@/helpers/inversion/container';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  BaseHelper,
  getError,
  RetryBackoffStrategies,
  RetryHelper,
  RetryJitterModes,
} from '@venizia/ignis-helpers/core';
import isEmpty from 'lodash/isEmpty';
import { EventDispatchRetry, EventHandlerTypes } from './common/constants';
import type {
  IDomainEvent,
  IEventHandler,
  IEventHandlerRetryOptions,
  TEventHandlerReference,
} from './common/types';

type TEventHandlerInvoker = (opts: { event: IDomainEvent<unknown> }) => ValueOrPromise<void>;

/** One `register`ed handler, resolved to concrete retry numbers and a ready-to-call invoker -
 * `EventDispatchRetry`'s defaults already applied and `handler`'s shape already resolved, so
 * `dispatch` never has to branch on either. */
interface IResolvedEventRegistration {
  invokeHandler: TEventHandlerInvoker;
  /** For the exhaustion log line only - a binding key or `<function fn.name>`. */
  description: string;
  maxAttempts: number;
  baseDelayMs: number;
}

/** In-process, fire-and-forget domain event bus. `TPayloadMap` keys the event names, so a wrong name
 * or payload shape is a compile error. Delivery is always async. Retry timing is a property of the
 * handler's own failure mode, not of the event, so `register` may tune it per registration. But
 * nobody awaits a fire-and-forget dispatch, so an unbounded window would let one event hold a
 * handler - and whatever it holds open, e.g. a database connection - for an unbounded time with no
 * one to report it. What the bus guarantees instead: a bounded MAXIMUM time a single dispatch can
 * occupy, enforced as a hard ceiling at `register()` - see `EventDispatchRetry`. Retry makes
 * delivery at-least-once: handlers must be idempotent, see `IEventHandler`. */
export class EventBus<TPayloadMap extends object> extends BaseHelper {
  private readonly container: Container;

  /** `register` appends, never replaces - two handlers may share an event name, and replacing would
   * drop the first with no way for the caller to notice. */
  private readonly registrationsByName: Map<string, IResolvedEventRegistration[]>;

  constructor(opts: { scope?: string; container: Container }) {
    super({ scope: opts.scope ?? EventBus.name });
    this.container = opts.container;
    this.registrationsByName = new Map();
  }

  /** The pre-jitter total of every inter-attempt delay `maxAttempts`/`baseDelayMs` would produce -
   * jitter (always on, see `dispatch`) only ever shrinks a delay, so this is a true upper bound. */
  private static computeTotalWindowMs(opts: { maxAttempts: number; baseDelayMs: number }): number {
    const { maxAttempts, baseDelayMs } = opts;
    let totalWindowMs = 0;

    for (let attempt = 1; attempt < maxAttempts; attempt++) {
      totalWindowMs += RetryHelper.computeBackoffDelayMs({
        attempt,
        backoff: {
          strategy: RetryBackoffStrategies.EXPONENTIAL,
          initialDelayMs: baseDelayMs,
          jitter: RetryJitterModes.NONE,
        },
      });
    }

    return totalWindowMs;
  }

  /** Loud rejection, never a silent clamp: a caller who believes a number the bus does not honour is
   * worse off than one who sees the ceiling at boot. */
  private static assertValidRetry(opts: {
    name: string;
    maxAttempts: number;
    baseDelayMs: number;
  }): void {
    const { name, maxAttempts, baseDelayMs } = opts;

    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw getError({
        message: `[EventBus][register] retry.maxAttempts must be a positive integer | name: ${name} | Got: ${maxAttempts}`,
      });
    }

    if (!Number.isInteger(baseDelayMs) || baseDelayMs < 1) {
      throw getError({
        message: `[EventBus][register] retry.baseDelayMs must be a positive integer | name: ${name} | Got: ${baseDelayMs}`,
      });
    }

    if (maxAttempts > EventDispatchRetry.MAX_ATTEMPTS_CEILING) {
      throw getError({
        message: `[EventBus][register] retry.maxAttempts exceeds the ceiling | name: ${name} | Got: ${maxAttempts} | Ceiling: ${EventDispatchRetry.MAX_ATTEMPTS_CEILING} | Lower retry.maxAttempts`,
      });
    }

    const totalWindowMs = EventBus.computeTotalWindowMs({ maxAttempts, baseDelayMs });
    if (totalWindowMs > EventDispatchRetry.MAX_TOTAL_WINDOW_MS) {
      throw getError({
        message: `[EventBus][register] retry window exceeds the ceiling | name: ${name} | Got: ${totalWindowMs}ms | Ceiling: ${EventDispatchRetry.MAX_TOTAL_WINDOW_MS}ms | Lower retry.maxAttempts or retry.baseDelayMs`,
      });
    }
  }

  /**
   * Turns `handler` into a uniform invoker plus a description for the exhaustion log line.
   * `BINDING_KEY` resolves through the container INSIDE the returned closure, so every call re-reads
   * the current binding; `FUNCTION` calls `fn` directly, so the closure IS the resolution - there is
   * nothing left to re-read on a later attempt. The tag (`handler.type`) is what this switches on,
   * not which field happens to be present - see `EventHandlerTypes`' doc.
   */
  private static buildHandlerInvoker(opts: {
    container: Container;
    handler: TEventHandlerReference<AnyType>;
    name: string;
  }): { invokeHandler: TEventHandlerInvoker; description: string } {
    const { container, handler, name } = opts;

    if (isEmpty(handler)) {
      throw getError({
        message: `[EventBus][register] Invalid handler | name: ${name} | Got: ${handler}`,
      });
    }

    switch (handler.type) {
      case EventHandlerTypes.BINDING_KEY: {
        const { key } = handler;
        if (isEmpty(key)) {
          throw getError({
            message: `[EventBus][register] Invalid handler.key | name: ${name} | Got: ${key}`,
          });
        }

        return {
          invokeHandler: ({ event }) => container.get<IEventHandler>({ key }).handle({ event }),
          description: `binding-key:${key}`,
        };
      }

      case EventHandlerTypes.FUNCTION: {
        const { fn } = handler;
        if (typeof fn !== 'function') {
          throw getError({
            message: `[EventBus][register] Invalid handler.fn | name: ${name} | Expected a function | Got: ${typeof fn}`,
          });
        }

        return {
          invokeHandler: ({ event }) => fn({ event }),
          description: `function:${fn.name || 'anonymous'}`,
        };
      }

      default: {
        throw getError({
          message: `[EventBus][register] Unknown handler.type | name: ${name} | Expected one of: ${[...EventHandlerTypes.SCHEME_SET].join(', ')} | Got: ${(handler as { type?: unknown }).type}`,
        });
      }
    }
  }

  /**
   * `retry` is optional and per REGISTRATION, not per publish: the right window belongs to the
   * handler's own failure mode, and two handlers on the same event name may each pick their own.
   * Omitting it reproduces today's `EventDispatchRetry` defaults exactly. Both `maxAttempts` and the
   * total backoff window it implies are bounded - see `EventDispatchRetry` - and exceeding either
   * throws here, at boot where a human sees it, rather than being silently clamped at dispatch time.
   */
  register<K extends keyof TPayloadMap & string>(opts: {
    name: K;
    /** A `BINDING_KEY` reference re-resolves through the container on every retry attempt, so a
     * rebind reaches a dispatch already in flight. A `FUNCTION` reference is captured as-is: a
     * rebind has nothing to reach, and every attempt in a long retry window calls the exact `fn`
     * registered here. */
    handler: TEventHandlerReference<TPayloadMap[K]>;
    retry?: IEventHandlerRetryOptions;
  }): void {
    const { name, handler, retry } = opts;

    if (isEmpty(name)) {
      throw getError({
        message: `[EventBus][register] Invalid registration | name: ${String(name)}`,
      });
    }

    const maxAttempts = retry?.maxAttempts ?? EventDispatchRetry.MAX_ATTEMPTS;
    const baseDelayMs = retry?.baseDelayMs ?? EventDispatchRetry.BASE_DELAY_MS;
    EventBus.assertValidRetry({ name, maxAttempts, baseDelayMs });

    const { invokeHandler, description } = EventBus.buildHandlerInvoker({
      container: this.container,
      handler,
      name,
    });

    const registration: IResolvedEventRegistration = {
      invokeHandler,
      description,
      maxAttempts,
      baseDelayMs,
    };

    const existing = this.registrationsByName.get(name);
    if (existing) {
      existing.push(registration);
      return;
    }

    this.registrationsByName.set(name, [registration]);
  }

  /**
   * Never blocks and never throws back to the caller: dispatch runs outside this call's flow via
   * `queueMicrotask`, and a handler failure is caught and logged where it happens (`dispatch`),
   * never here.
   */
  publish<K extends keyof TPayloadMap & string>(opts: {
    name: K;
    payload: TPayloadMap[K];
    traceId?: string;
  }): void {
    const { name, payload, traceId } = opts;

    const event: IDomainEvent<TPayloadMap[K]> = {
      name,
      payload,
      occurredAt: new Date().toISOString(),
      traceId,
    };

    const registrations = this.registrationsByName.get(name);
    if (!registrations?.length) {
      // A typo is already a compile error, so at runtime this only means nobody is listening yet -
      // a legitimate state on a fire-and-forget bus, not an incident.
      this.logger.debug('[publish] No handler registered | name: %s | traceId: %s', name, traceId);
      return;
    }

    for (const registration of registrations) {
      queueMicrotask(() => {
        // `dispatch` catches every failure path itself and never rejects - this `.catch` is an
        // unreachable backstop, kept (and logged) rather than left floating, for the day it isn't.
        this.dispatch({ event, registration }).catch((error: unknown) => {
          this.logger.error(
            '[publish] Unexpected dispatch failure | name: %s | Error: %s',
            event.name,
            error,
          );
        });
      });
    }
  }

  /**
   * Attempts/backoff come from the registration (`EventDispatchRetry`'s defaults when omitted),
   * always with full jitter - `RetryJitterModes.FULL` decorrelates a shared-resource pile-up hardest,
   * so many handlers retrying the same lock do not collide on the same instant a second and third
   * time. `invokeHandler` already encodes whether that re-resolves (`BINDING_KEY`) or was captured
   * once (`FUNCTION`) - see `buildHandlerInvoker` - so this method calls it uniformly. A handler that
   * throws synchronously is caught exactly like one that returns a rejected promise: `execution`
   * here is itself `async`, and JS converts a synchronous throw inside an async function body into a
   * rejection of that function's own promise - `RetryHelper.executeWithRetry`'s attempt loop never
   * sees the difference.
   *
   * `RetryHelper.executeWithRetry` is used without its own `logger` - its internal per-attempt/exhaustion
   * logging knows nothing about the event name or `traceId`, so it cannot be the trace anyone
   * relies on. The one line below, logged only on final failure, is.
   */
  private async dispatch(opts: {
    event: IDomainEvent<unknown>;
    registration: IResolvedEventRegistration;
  }): Promise<void> {
    const { event, registration } = opts;
    const { invokeHandler, description, maxAttempts, baseDelayMs } = registration;
    let lastAttempt = 0;

    try {
      await RetryHelper.executeWithRetry({
        operation: `EventBus.dispatch:${event.name}`,
        maxAttempts,
        backoff: {
          strategy: RetryBackoffStrategies.EXPONENTIAL,
          initialDelayMs: baseDelayMs,
          jitter: RetryJitterModes.FULL,
        },
        execution: async ({ attempt }) => {
          lastAttempt = attempt;
          await invokeHandler({ event });
        },
      });
    } catch (error) {
      // The only trace this failure leaves: it is caught here and never reaches the publisher, so
      // the event name, traceId and attempt count all have to be on this one line.
      this.logger.error(
        '[dispatch] Handler exhausted retries | name: %s | traceId: %s | attempts: %d | handler: %s | Error: %s',
        event.name,
        event.traceId,
        lastAttempt,
        description,
        error,
      );
    }
  }
}

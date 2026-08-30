import type { Container } from '@/helpers/inversion/container';
import {
  BaseHelper,
  executeWithRetry,
  getError,
  RetryBackoffStrategies,
  RetryJitterModes,
} from '@venizia/ignis-helpers/core';
import isEmpty from 'lodash/isEmpty';
import { EventDispatchRetry } from './common/constants';
import type { IDomainEvent, IEventHandler } from './common/types';

/** In-process, fire-and-forget domain event bus. `TPayloadMap` keys the event names, so a wrong name
 * or payload shape is a compile error. Delivery is always async and retry is fixed - there is no
 * knob for either, so "published" guarantees the same thing at every call site. Retry makes delivery
 * at-least-once: handlers must be idempotent, see `IEventHandler`. */
export class EventBus<TPayloadMap extends object> extends BaseHelper {
  private readonly container: Container;

  /** `register` appends, never replaces - two handlers may share an event name, and replacing would
   * drop the first with no way for the caller to notice. */
  private readonly handlerBindingKeysByName: Map<string, string[]>;

  constructor(opts: { scope?: string; container: Container }) {
    super({ scope: opts.scope ?? EventBus.name });
    this.container = opts.container;
    this.handlerBindingKeysByName = new Map();
  }

  register<K extends keyof TPayloadMap & string>(opts: {
    name: K;
    handlerBindingKey: string;
  }): void {
    const { name, handlerBindingKey } = opts;

    if (isEmpty(name) || isEmpty(handlerBindingKey)) {
      throw getError({
        message: `[EventBus][register] Invalid registration | name: ${String(name)} | handlerBindingKey: ${handlerBindingKey}`,
      });
    }

    const existing = this.handlerBindingKeysByName.get(name);
    if (existing) {
      existing.push(handlerBindingKey);
      return;
    }

    this.handlerBindingKeysByName.set(name, [handlerBindingKey]);
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

    const handlerBindingKeys = this.handlerBindingKeysByName.get(name);
    if (!handlerBindingKeys?.length) {
      // A typo is already a compile error, so at runtime this only means nobody is listening yet -
      // a legitimate state on a fire-and-forget bus, not an incident.
      this.logger.debug('[publish] No handler registered | name: %s | traceId: %s', name, traceId);
      return;
    }

    for (const handlerBindingKey of handlerBindingKeys) {
      queueMicrotask(() => {
        // `dispatch` catches every failure path itself and never rejects - this `.catch` is an
        // unreachable backstop, kept (and logged) rather than left floating, for the day it isn't.
        this.dispatch({ event, handlerBindingKey }).catch((error: unknown) => {
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
   * Fixed 3 attempts / ~100ms exponential backoff, no jitter - see `EventDispatchRetry`. The
   * handler is resolved fresh from the container on every attempt rather than once up front, so a
   * rebind takes effect on the very next attempt of a dispatch already in flight.
   *
   * `executeWithRetry` is used without its own `logger` - its internal per-attempt/exhaustion
   * logging knows nothing about the event name or `traceId`, so it cannot be the trace anyone
   * relies on. The one line below, logged only on final failure, is.
   */
  private async dispatch(opts: {
    event: IDomainEvent<unknown>;
    handlerBindingKey: string;
  }): Promise<void> {
    const { event, handlerBindingKey } = opts;
    let lastAttempt = 0;

    try {
      await executeWithRetry({
        operation: `EventBus.dispatch:${event.name}`,
        maxAttempts: EventDispatchRetry.MAX_ATTEMPTS,
        backoff: {
          strategy: RetryBackoffStrategies.EXPONENTIAL,
          initialDelayMs: EventDispatchRetry.BASE_DELAY_MS,
          jitter: RetryJitterModes.NONE,
        },
        execution: async ({ attempt }) => {
          lastAttempt = attempt;
          const handler = this.container.get<IEventHandler>({ key: handlerBindingKey });
          await handler.handle({ event });
        },
      });
    } catch (error) {
      // The only trace this failure leaves: it is caught here and never reaches the publisher, so
      // the event name, traceId and attempt count all have to be on this one line.
      this.logger.error(
        '[dispatch] Handler exhausted retries | name: %s | traceId: %s | attempts: %d | handlerBindingKey: %s | Error: %s',
        event.name,
        event.traceId,
        lastAttempt,
        handlerBindingKey,
        error,
      );
    }
  }
}

import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { EventHandlerTypes } from './constants';

/** One occurrence of a named domain event, decoupled from whatever publishes or handles it. */
export interface IDomainEvent<TPayload = unknown> {
  name: string;
  payload: TPayload;
  occurredAt: string;
  traceId?: string;
}

/**
 * Per-registration retry override for `EventBus.register`. Both fields must be positive integers,
 * and are bounded by `EventDispatchRetry.MAX_ATTEMPTS_CEILING` / `MAX_TOTAL_WINDOW_MS` - a value
 * outside either throws at `register()`, never clamps.
 */
export interface IEventHandlerRetryOptions {
  /** Default `EventDispatchRetry.MAX_ATTEMPTS`. */
  maxAttempts?: number;

  /** First backoff delay in ms; exponential growth is computed from it. Default `EventDispatchRetry.BASE_DELAY_MS`. */
  baseDelayMs?: number;
}

/** A handler callback - synchronous or asynchronous, `EventBus` awaits either the same way. */
export type TEventHandlerFunction<TPayload = unknown> = (opts: {
  event: IDomainEvent<TPayload>;
}) => ValueOrPromise<void>;

/** `register`'s binding-key handler shape: resolved from the container by `key` on every retry attempt. */
export interface IEventHandlerBindingKeyReference {
  type: typeof EventHandlerTypes.BINDING_KEY;
  key: string;
}

/** `register`'s function handler shape: `fn` is invoked directly, captured as a closure - see `TEventHandlerReference`. */
export interface IEventHandlerFunctionReference<TPayload = unknown> {
  type: typeof EventHandlerTypes.FUNCTION;
  fn: TEventHandlerFunction<TPayload>;
}

/**
 * The two shapes `EventBus.register`'s `handler` accepts, tagged by `type` so the caller states
 * which rather than the bus inferring it from whichever field is present. Only `BINDING_KEY` shares
 * `IEventHandler`'s rebind property; see its doc.
 */
export type TEventHandlerReference<TPayload = unknown> =
  IEventHandlerBindingKeyReference | IEventHandlerFunctionReference<TPayload>;

/**
 * Handles one `IDomainEvent`. Implemented by whatever is bound into the container under
 * `register`'s `{ type: EventHandlerTypes.BINDING_KEY, key }` form - see `TEventHandlerReference`
 * for the `FUNCTION` form, which does not implement this interface and does not share its rebind
 * property.
 *
 * MUST be idempotent. The bus retries a failed handler, so delivery is at-least-once: one that
 * half-succeeds then throws runs again from the top, re-applying whatever already landed. Three
 * shapes break, and only the first looks dangerous: a cumulative write (`count = count + 1`, or a
 * rolling average, which drifts toward the resampled value); several writes batched under one
 * `Promise.all`, where any failure re-runs the ones that succeeded; and a bare INSERT of a log or
 * audit row, which simply gains a duplicate - corrupting the record used to diagnose the retry.
 *
 * Resolved from the container by binding key at dispatch time, never captured as a direct reference,
 * so rebinding the key takes effect on the next attempt - including one already in flight. A
 * `FUNCTION`-form handler does NOT have this property: `fn` is a captured closure, so every attempt
 * in a long retry window calls the exact function registered at startup.
 */
export interface IEventHandler<TEvent extends IDomainEvent = IDomainEvent> {
  handle(opts: { event: TEvent }): ValueOrPromise<void>;
}

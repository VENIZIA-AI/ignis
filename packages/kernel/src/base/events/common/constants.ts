import type { TConstValue } from '@venizia/ignis-helpers/common';

export class EventDispatchRetry {
  static readonly MAX_ATTEMPTS = 3;
  static readonly BASE_DELAY_MS = 100;

  /**
   * Ceiling on `register`'s `retry.maxAttempts`. Dispatch is fire-and-forget - nobody awaits it - so
   * an attempt count high enough to matter is already high enough to hammer a struggling downstream
   * resource attempt after attempt. Twice the highest count any known consumer has asked for (5)
   * leaves room to tune without permitting an attempt storm.
   */
  static readonly MAX_ATTEMPTS_CEILING = 10;

  /**
   * Ceiling, in ms, on the total backoff window `register`'s `retry` can produce (the sum of every
   * inter-attempt delay, computed without jitter since jitter only shrinks it). Matches
   * `RetryHelper`'s own default cap on a SINGLE delay: a dispatch holds a handler's resources - e.g.
   * a database connection - for its entire retry window, so the sum across every attempt gets the
   * same "unreasonable beyond this" line the framework already draws for one attempt.
   */
  static readonly MAX_TOTAL_WINDOW_MS = 30_000;
}

/**
 * Tag for `EventBus.register`'s `handler` union (`TEventHandlerReference`). The tag makes the
 * caller's choice explicit at the call site instead of implicit in whichever field is present, so a
 * mismatched `type`/field pair (`BINDING_KEY` with `fn`, or `FUNCTION` with `key`) is a compile
 * error there rather than a runtime surprise later, inside a `queueMicrotask` where nobody is
 * watching.
 */
export class EventHandlerTypes {
  /** `handler.key` is resolved from the container on every retry attempt - a rebind reaches an attempt already in flight. */
  static readonly BINDING_KEY = 'binding-key';

  /** `handler.fn` is invoked directly as a captured closure - there is nothing to rebind, so every attempt in a retry window calls the exact function registered here. */
  static readonly FUNCTION = 'function';

  static readonly SCHEME_SET = new Set<string>([this.BINDING_KEY, this.FUNCTION]);

  static isValid(value: string): value is TEventHandlerType {
    return this.SCHEME_SET.has(value);
  }
}

export type TEventHandlerType = TConstValue<typeof EventHandlerTypes>;

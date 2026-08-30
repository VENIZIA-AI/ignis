/** One occurrence of a named domain event, decoupled from whatever publishes or handles it. */
export interface IDomainEvent<TPayload = unknown> {
  name: string;
  payload: TPayload;
  occurredAt: string;
  traceId?: string;
}

/**
 * Handles one `IDomainEvent`.
 *
 * MUST be idempotent. The bus retries a failed handler, so delivery is at-least-once: one that
 * half-succeeds then throws runs again from the top, re-applying whatever already landed. Three
 * shapes break, and only the first looks dangerous: a cumulative write (`count = count + 1`, or a
 * rolling average, which drifts toward the resampled value); several writes batched under one
 * `Promise.all`, where any failure re-runs the ones that succeeded; and a bare INSERT of a log or
 * audit row, which simply gains a duplicate - corrupting the record used to diagnose the retry.
 *
 * Resolved from the container by binding key at dispatch time, never captured as a direct reference,
 * so rebinding the key takes effect on the next attempt - including one already in flight.
 */
export interface IEventHandler<TEvent extends IDomainEvent = IDomainEvent> {
  handle(opts: { event: TEvent }): Promise<void>;
}

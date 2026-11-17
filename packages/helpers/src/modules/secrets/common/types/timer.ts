/** Injectable clock so tests advance time deterministically. */
export interface IClock {
  now(): number;
}

/** Opaque handle returned by `ITimerAdapter.set`. */
export type TTimerHandle = ReturnType<typeof setTimeout> | number | object;

/** Injectable timer seam so tests fire renewals without real waits. */
export interface ITimerAdapter {
  set(handler: () => void, ms: number): TTimerHandle;
  clear(handle: TTimerHandle): void;
}

import { BUFFER_SIZE, ENTRY_SIZE, TRingState } from './common';

/** One ring per process, allocated on FIRST use. Plain ArrayBuffer on purpose - single hot thread design, so shared memory/atomics would only tax the hot path. */
let ringState: TRingState | null = null;

export const getRing = (): TRingState => {
  if (!ringState) {
    const buffer = new ArrayBuffer(BUFFER_SIZE * ENTRY_SIZE);
    ringState = { bytes: new Uint8Array(buffer), f64: new Float64Array(buffer), writeIndex: 0 };
  }
  return ringState;
};

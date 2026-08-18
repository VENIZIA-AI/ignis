import { BUFFER_SIZE, ENTRY_SIZE, TRingState } from './common';

/** One ring per process, allocated on FIRST use. Plain ArrayBuffer on purpose - single hot thread design, so shared memory/atomics would only tax the hot path. */
export class HfLogRing {
  private static state: TRingState | null = null;

  static get(): TRingState {
    if (HfLogRing.state) {
      return HfLogRing.state;
    }

    const buffer = new ArrayBuffer(BUFFER_SIZE * ENTRY_SIZE);
    HfLogRing.state = {
      bytes: new Uint8Array(buffer),
      f64: new Float64Array(buffer),
      writeIndex: 0,
    };
    return HfLogRing.state;
  }
}

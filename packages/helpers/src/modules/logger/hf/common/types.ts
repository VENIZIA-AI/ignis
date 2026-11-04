import type { TLogLevel } from '../../common';

/** The levels the high-frequency logger writes: the shared log levels. */
export type THfLogLevel = TLogLevel;

/** One batch handed to a sink: the rendered `lines`, and `dropped`, the number of entries overwritten in the ring before they could be read. */
export type THfSinkBatch = { lines: Array<string>; dropped: number };

/** Declared `=> void` ON PURPOSE: TS's void-return exemption lets both sync and `async` sinks assign to it (`void | Promise<void>` would reject the sync form); the flusher still awaits a returned thenable, so a rejection is caught and logged, never unhandled. */
export type THfSink = (batch: THfSinkBatch) => void;

/** Where the high-frequency logger flusher delivers batches: a custom `sink`, a `filePath`, or stdout when neither is set. */
export interface IHfLogFlusherOptions {
  /** Full custom delivery. Overrides filePath. */
  sink?: THfSink;
  /** Default sink appends here instead of writing to stdout. */
  filePath?: string;
  /** Entries rendered per batch before yielding. Defaults to HF_DEFAULT_BATCH_SIZE. */
  batchSize?: number;
}

export type TRingState = { bytes: Uint8Array; f64: Float64Array; writeIndex: number };

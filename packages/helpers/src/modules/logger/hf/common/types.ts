export type THfLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'emerg';

export type THfSinkBatch = { lines: Array<string>; dropped: number };

/** Declared `=> void` ON PURPOSE: TS's void-return exemption lets both sync and `async` sinks assign to it (`void | Promise<void>` would reject the sync form); the flusher still awaits a returned thenable, so a rejection is caught and logged, never unhandled. */
export type THfSink = (batch: THfSinkBatch) => void;

export interface IHfLogFlusherOptions {
  /** Full custom delivery. Overrides filePath. */
  sink?: THfSink;
  /** Default sink appends here instead of writing to stdout. */
  filePath?: string;
  /** Entries rendered per batch before yielding. Defaults to HF_DEFAULT_BATCH_SIZE. */
  batchSize?: number;
}

export type TRingState = { bytes: Uint8Array; f64: Float64Array; writeIndex: number };

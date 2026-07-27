import fs from 'node:fs';
import { AnyType } from '@/common/types';
import { isPromiseLike } from '@/utilities/promise.utility';
import {
  BUFFER_SIZE,
  ENTRY_SIZE,
  HF_DEFAULT_BATCH_SIZE,
  HF_DEFAULT_FLUSH_INTERVAL_MS,
  HF_LEVEL_NAMES,
  IHfLogFlusherOptions,
  OFFSET_LEVEL,
  OFFSET_MESSAGE,
  OFFSET_MESSAGE_LENGTH,
  OFFSET_SCOPE,
  OFFSET_SCOPE_LENGTH,
  THfSink,
  TRingState,
} from './common';
import { getRing } from './ring';

const textDecoder = new TextDecoder();

const renderEntry = (ring: TRingState, sequence: number): string => {
  const offset = (sequence & (BUFFER_SIZE - 1)) * ENTRY_SIZE;
  const bytes = ring.bytes;
  const iso = new Date(ring.f64[offset >> 3]).toISOString();
  const levelName = HF_LEVEL_NAMES[bytes[offset + OFFSET_LEVEL]] ?? 'info';
  const scopeLength = bytes[offset + OFFSET_SCOPE_LENGTH];
  const scope = textDecoder.decode(
    bytes.subarray(offset + OFFSET_SCOPE, offset + OFFSET_SCOPE + scopeLength),
  );
  const messageLength = bytes[offset + OFFSET_MESSAGE_LENGTH];
  const message = textDecoder.decode(
    bytes.subarray(offset + OFFSET_MESSAGE, offset + OFFSET_MESSAGE + messageLength),
  );
  return `${iso} [${levelName}] ${scope} ${message}`;
};

const buildDefaultSink = (filePath?: string): THfSink => {
  return batch => {
    const rendered =
      (batch.dropped > 0
        ? `${new Date().toISOString()} [warn] HfLogFlusher ring lapped - ${batch.dropped} entries overwritten before they could be read\n`
        : '') +
      batch.lines.join('\n') +
      '\n';

    if (filePath) {
      fs.appendFileSync(filePath, rendered);
      return;
    }
    process.stdout.write(rendered);
  };
};

/** Drains the ring in bounded batches, yielding between them - see the spec's lap accounting. */
export class HfLogFlusher {
  private flushIndex = 0;
  private inFlightDrain: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sink: THfSink;
  private readonly batchSize: number;

  constructor(options?: IHfLogFlusherOptions) {
    this.sink = options?.sink ?? buildDefaultSink(options?.filePath);

    const batchSize = options?.batchSize ?? HF_DEFAULT_BATCH_SIZE;
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      // console, not the Logger: this IS the drain path - routing through a logger re-enters it.
      console.warn(
        '[HfLogFlusher] Invalid batchSize | value: %s | fallback: %s',
        batchSize,
        HF_DEFAULT_BATCH_SIZE,
      );
      this.batchSize = HF_DEFAULT_BATCH_SIZE;
    } else {
      this.batchSize = batchSize;
    }
  }

  flush(): Promise<void> {
    if (this.inFlightDrain) {
      return this.inFlightDrain;
    }
    this.inFlightDrain = this.drain().finally(() => {
      this.inFlightDrain = null;
    });
    return this.inFlightDrain;
  }

  private async drain(): Promise<void> {
    const ring = getRing();

    while (this.flushIndex < ring.writeIndex) {
      // Lap accounting, re-checked every batch: the producer may advance during yields.
      let dropped = 0;
      const backlog = ring.writeIndex - this.flushIndex;
      if (backlog > BUFFER_SIZE) {
        dropped = backlog - BUFFER_SIZE;
        this.flushIndex = ring.writeIndex - BUFFER_SIZE;
      }

      const count = Math.min(this.batchSize, ring.writeIndex - this.flushIndex);
      const lines: Array<string> = [];
      for (let index = 0; index < count; index++) {
        lines.push(renderEntry(ring, this.flushIndex++));
      }

      await this.deliverBatch({ lines, dropped });

      if (this.flushIndex < ring.writeIndex) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  private async deliverBatch(opts: { lines: Array<string>; dropped: number }): Promise<void> {
    try {
      // THfSink is typed `=> void`, but an async sink still returns a thenable at runtime - await it inside the try so its rejection is caught here, never unhandled.
      const delivered = this.sink(opts) as AnyType;
      if (isPromiseLike(delivered)) {
        await delivered;
      }
    } catch (error) {
      console.error('[HfLogFlusher][drain] Sink failed | error: ', error);
    }
  }

  start(intervalMs = HF_DEFAULT_FLUSH_INTERVAL_MS): void {
    this.stop();
    this.timer = setInterval(() => {
      this.flush().catch(error => {
        console.error('[HfLogFlusher][start] Flush failed | error: ', error);
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

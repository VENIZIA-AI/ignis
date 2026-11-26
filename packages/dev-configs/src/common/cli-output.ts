import { writeSync } from 'node:fs';
import { format } from 'node:util';

/**
 * What a `devz` command prints: its result on stdout, its warnings and errors on stderr, formatted as `console` does.
 *
 * The writes are synchronous and complete before the call returns. `process.stdout.write` queues on a pipe in Bun, and
 * what is still queued when the process exits is lost.
 */
export class CliOutput {
  private static readonly STDOUT = 1;
  private static readonly STDERR = 2;
  private static readonly pause = new Int32Array(new SharedArrayBuffer(4));

  private static write(opts: { fd: number; parts: Array<unknown> }): void {
    const bytes = Buffer.from(`${format(...opts.parts)}\n`);
    let written = 0;

    while (written < bytes.length) {
      try {
        // A pipe another writer made non-blocking takes only what fits its buffer.
        written += writeSync(opts.fd, bytes, written);
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? error.code : undefined;

        // The reader closed the pipe (`devz ... | head`): there is nobody left to tell.
        if (code === 'EPIPE') {
          return;
        }

        if (code !== 'EAGAIN') {
          throw error;
        }

        // The buffer is full: wait a millisecond for the reader.
        Atomics.wait(CliOutput.pause, 0, 0, 1);
      }
    }
  }

  static log(...parts: Array<unknown>): void {
    CliOutput.write({ fd: CliOutput.STDOUT, parts });
  }

  static warn(...parts: Array<unknown>): void {
    CliOutput.write({ fd: CliOutput.STDERR, parts });
  }

  static error(...parts: Array<unknown>): void {
    CliOutput.write({ fd: CliOutput.STDERR, parts });
  }
}

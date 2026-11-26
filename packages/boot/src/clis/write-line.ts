import { writeSync } from 'node:fs';

const pause = new Int32Array(new SharedArrayBuffer(4));

/**
 * One line of the CLI's own output on file descriptor `1` (stdout) or `2` (stderr), written in full before the call
 * returns: `process.stdout.write` queues on a pipe in Bun, and what is still queued at `process.exit` is lost.
 */
export const writeLine = (opts: { fd: 1 | 2; line: string }): void => {
  const bytes = Buffer.from(`${opts.line}\n`);
  let written = 0;

  while (written < bytes.length) {
    try {
      // A pipe another writer made non-blocking takes only what fits its buffer.
      written += writeSync(opts.fd, bytes, written);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;

      // The reader closed the pipe: there is nobody left to tell.
      if (code === 'EPIPE') {
        return;
      }

      if (code !== 'EAGAIN') {
        throw error;
      }

      // The buffer is full: wait a millisecond for the reader.
      Atomics.wait(pause, 0, 0, 1);
    }
  }
};

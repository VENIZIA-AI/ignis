import type { TNote } from '@/models/note.model';
import { getError, HTTP } from '@venizia/ignis-helpers';

/** The notes a watcher has not read yet; past this, a reader that stopped reading is dropped. */
const MAX_PENDING = 1_000;

/** One followed `WatchNotes` call: the notes created for its owner, waiting to be sent. */
export class NoteWatcher {
  private readonly pending: TNote[] = [];
  private isOverflowed = false;
  private wake?: () => void;

  constructor(readonly ownerId: string) {}

  push(opts: { note: TNote }) {
    if (this.pending.length >= MAX_PENDING) {
      this.isOverflowed = true;
    } else {
      this.pending.push(opts.note);
    }

    this.wake?.();
  }

  /** The next note. Rejects with the signal's reason when the call is over. */
  async next(opts: { signal: AbortSignal }): Promise<TNote> {
    for (;;) {
      opts.signal.throwIfAborted();

      if (this.isOverflowed) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.TooManyRequests,
          message: 'The stream was read too slowly',
        });
      }

      const note = this.pending.shift();

      if (note) {
        return note;
      }

      await this.waitForChange({ signal: opts.signal });
    }
  }

  private waitForChange(opts: { signal: AbortSignal }) {
    const { signal } = opts;

    return new Promise<void>((resolve) => {
      const done = () => {
        signal.removeEventListener('abort', done);
        this.wake = undefined;
        resolve();
      };

      this.wake = done;
      signal.addEventListener('abort', done, { once: true });
    });
  }
}

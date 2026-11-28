import { CurrentUser } from '@/common/current-user';
import type { TNote } from '@/models/note.model';
import { NoteRepository } from '@/repositories/note.repository';
import { NoteWatcher } from '@/services/note-watcher';
import { BaseService, BindingScopes, inject, service } from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';

/** The most notes one `watch` call lists before it follows. */
const MAX_LISTED = 100;

/** A note as a caller sends it: the owner is never theirs to choose. */
export interface INoteDraft {
  title: string;
  body: string;
}

/**
 * The note use cases. A singleton, because it holds the followed streams of this process: an application with several
 * instances needs a shared channel (Redis, Postgres `LISTEN`) to hand a new note to a watcher of another instance.
 */
@service({ scope: BindingScopes.SINGLETON })
export class NoteService extends BaseService {
  private readonly watchers = new Set<NoteWatcher>();

  constructor(@inject({ target: NoteRepository }) private readonly noteRepository: NoteRepository) {
    super({ scope: NoteService.name });
  }

  countWatchers() {
    return this.watchers.size;
  }

  async get(opts: { id: string }): Promise<TNote> {
    const note = await this.noteRepository.findById({ id: opts.id });

    // A note of another owner is outside the row scope, so it reads as absent.
    if (!note) {
      throw getError({ statusCode: HTTP.ResultCodes.RS_4.NotFound, message: 'Note not found' });
    }

    return note;
  }

  /** Saves every draft in one insert, for the signed-in user, and hands them to that user's watchers. */
  async create(opts: { drafts: INoteDraft[] }): Promise<TNote[]> {
    const ownerId = CurrentUser.requireId();
    const { data } = await this.noteRepository.createAll({
      data: opts.drafts.map((draft) => ({ ...draft, ownerId })),
    });

    for (const watcher of this.watchers) {
      if (watcher.ownerId !== ownerId) {
        continue;
      }

      for (const note of data) {
        watcher.push({ note });
      }
    }

    return data;
  }

  /**
   * The signed-in user's notes, oldest first (at most 100), then with `follow` each new one until the signal aborts.
   */
  async *watch(opts: { follow: boolean; signal: AbortSignal }): AsyncGenerator<TNote> {
    // Registered before the list is read, so a note created meanwhile is not lost.
    const watcher = opts.follow ? this.openWatcher() : undefined;

    try {
      const listed = await this.noteRepository.find({
        filter: { order: ['id ASC'], limit: MAX_LISTED },
      });
      const sent = new Set(listed.map((note) => note.id));
      yield* listed;

      while (watcher) {
        const note = await watcher.next({ signal: opts.signal });

        if (!sent.has(note.id)) {
          yield note;
        }
      }
    } finally {
      if (watcher) {
        this.watchers.delete(watcher);
      }
    }
  }

  private openWatcher() {
    const watcher = new NoteWatcher(CurrentUser.requireId());
    this.watchers.add(watcher);

    return watcher;
  }
}

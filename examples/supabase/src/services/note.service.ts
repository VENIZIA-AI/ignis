import { SupabaseDataSource } from '@/datasources/supabase.datasource';
import type { TNote } from '@/models/note.model';
import { NoteRepository } from '@/repositories/note.repository';
import { BaseService, inject, service } from '@venizia/ignis';
import type { IDatabaseTransaction } from '@venizia/ignis/postgres';
import { withAuthContext } from '@venizia/ignis/postgres/supabase';

/**
 * Every write and every scoped read goes through `runAsUser`: open a transaction, establish the
 * caller's identity inside it, run the repository call, commit.
 *
 * The transaction is not decoration. `withAuthContext` uses `SET LOCAL` / `set_config(..., true)`,
 * which is transaction-scoped - and that is what makes it safe behind a pooler. A plain `SET` would
 * leak the caller's identity to whoever borrows the connection next.
 */
@service()
export class NoteService extends BaseService {
  constructor(
    @inject({ key: 'datasources.SupabaseDataSource' })
    private dataSource: SupabaseDataSource,

    @inject({ key: 'repositories.NoteRepository' })
    private noteRepository: NoteRepository,
  ) {
    super({ scope: NoteService.name });
  }

  /**
   * Runs `handler` inside a transaction carrying the caller's claims, so `auth.uid()` resolves and the
   * table's RLS policies decide what the statement may touch. `role` defaults to the JWT's own `role`
   * claim - PostgREST semantics, and the only default that cannot contradict `request.jwt.claims`.
   */
  private async runAsUser<T>(opts: {
    claims: Record<string, unknown>;
    handler: (transaction: IDatabaseTransaction) => Promise<T>;
  }): Promise<T> {
    const { claims, handler } = opts;

    const transaction = await this.dataSource.beginTransaction();

    try {
      await withAuthContext({ transaction, claims });
      const result = await handler(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      // rollback() rethrows on failure, so it must not be the last thing standing between the caller
      // and the error that actually caused this.
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        this.logger.for('runAsUser').error('Rollback failed | Error: %s', rollbackError);
      }

      throw error;
    }
  }

  /** The caller's own notes. There is no `where owner_id = ...` anywhere in this method. */
  find(opts: { claims: Record<string, unknown> }): Promise<Array<TNote>> {
    return this.runAsUser({
      claims: opts.claims,
      handler: transaction =>
        this.noteRepository.find<TNote>({ filter: {}, options: { transaction } }),
    });
  }

  /**
   * `ownerId` is never passed. It defaults to `auth.uid()` in the table, so the database stamps
   * ownership from the transaction's own context - a client that lies in its body changes nothing.
   */
  create(opts: {
    claims: Record<string, unknown>;
    data: { title: string; content?: string; isPrivate?: boolean };
  }): Promise<TNote> {
    return this.runAsUser({
      claims: opts.claims,
      handler: async transaction => {
        const rs = await this.noteRepository.create<TNote>({
          data: opts.data,
          options: { transaction },
        });
        return rs.data;
      },
    });
  }

  /** Deleting someone else's note is not rejected here - it simply matches no row. */
  async deleteById(opts: { claims: Record<string, unknown>; id: string }): Promise<{
    count: number;
  }> {
    return this.runAsUser({
      claims: opts.claims,
      handler: async transaction => {
        const rs = await this.noteRepository.deleteById<TNote>({
          id: opts.id,
          options: { transaction },
        });
        return { count: rs.count };
      },
    });
  }

  /**
   * The control group. Same repository, same table - but through the pooled connector as the
   * connection's own role, with no auth context established. RLS does not apply: every row comes
   * back. The only difference between this and `find()` above is `withAuthContext`.
   */
  findUnscoped(): Promise<Array<TNote>> {
    return this.noteRepository.find<TNote>({ filter: {} });
  }
}

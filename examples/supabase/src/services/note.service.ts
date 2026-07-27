import { SupabaseDataSource } from '@/datasources';
import { Note } from '@/models';
import { NoteRepository } from '@/repositories';
import { BaseService, BindingNamespaces, inject } from '@venizia/ignis';
import type { IDatabaseTransaction, TTableObject } from '@venizia/ignis/postgres';
import { withAuthContext } from '@venizia/ignis/postgres/supabase';
import { BindingKeys } from '@venizia/ignis-inversion';

export type TNote = TTableObject<typeof Note.schema>;

/**
 * Every write and every scoped read goes through `runAsUser`: open a transaction, establish the
 * caller's identity inside it, run the repository call, commit.
 *
 * The transaction is not decoration. `withAuthContext` uses `SET LOCAL` / `set_config(..., true)`,
 * which is transaction-scoped - and that is precisely what makes it safe behind a pooler. A plain
 * `SET` would leak the caller's identity to whoever borrows the connection next.
 */
export class NoteService extends BaseService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.DATASOURCE,
        key: SupabaseDataSource.name,
      }),
    })
    private dataSource: SupabaseDataSource,

    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: NoteRepository.name,
      }),
    })
    private noteRepository: NoteRepository,
  ) {
    super({ scope: NoteService.name });
  }

  /**
   * Runs `handler` inside a transaction that carries the caller's Supabase claims, so `auth.uid()`
   * resolves and the table's RLS policies can decide what the statement is allowed to touch.
   *
   * `role` is left to default to the JWT's own `role` claim - PostgREST semantics, and the only
   * default that cannot contradict `request.jwt.claims`.
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
      // rollback() rethrows on failure, so it must not be the last thing standing between the
      // caller and the error that actually caused this.
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        this.logger.for('runAsUser').error('Rollback failed | Error: %s', rollbackError);
      }

      throw error;
    }
  }

  /**
   * Returns the caller's notes. There is no `where` clause on `ownerId` anywhere in this method -
   * the scoping is the database's doing.
   */
  find(opts: { claims: Record<string, unknown> }): Promise<Array<TNote>> {
    return this.runAsUser({
      claims: opts.claims,
      handler: transaction =>
        this.noteRepository.find<TNote>({ filter: {}, options: { transaction } }),
    });
  }

  /**
   * `ownerId` is never passed. It defaults to `auth.uid()` in the table definition, so the database
   * stamps ownership from the very context the transaction carries - an owner cannot be forged by a
   * client that lies in its request body.
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

  /** Deleting someone else's note is not forbidden by a check here - it simply matches no row. */
  async deleteById(opts: {
    claims: Record<string, unknown>;
    id: string;
  }): Promise<{ count: number }> {
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
   * The contrast. Same repository, same table - but this call goes through the POOLED connector as
   * the connection's own role (`postgres`, the table owner), with no auth context established. RLS
   * does not apply, and every row comes back.
   *
   * This is what makes `find()` above a demonstration rather than a claim: the only difference
   * between them is `withAuthContext`.
   */
  findUnscoped(): Promise<Array<TNote>> {
    return this.noteRepository.find<TNote>({ filter: {} });
  }
}

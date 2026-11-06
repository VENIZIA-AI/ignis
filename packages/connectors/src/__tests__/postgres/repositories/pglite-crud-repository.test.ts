import type { PGlite } from '@electric-sql/pglite';
import { describe, expect, test } from 'bun:test';
import { pgTable, text } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import type { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { PostgresIdEnricher } from '@/relational/postgres/models';
import type { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteCRUDRepository } from '@/relational/postgres/drivers/pglite';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';

/**
 * `tsc --noEmit` (`make typecheck`) is the real gate for this file: `bun test` strips types. The short form
 * `extends PGliteCRUDRepository<typeof table>` takes a PGlite datasource and refuses another client, while
 * `DefaultCRUDRepository` keeps its `pg.Pool` default.
 */
const noteTable = pgTable('Note927', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  title: text('title'),
});

declare const pgliteDataSource: BasePostgresDataSource<{}, {}, {}, PGlite>;
declare const poolDataSource: BasePostgresDataSource<{}, {}, {}, Pool>;
declare const sqliteDataSource: BaseSqliteDataSource;

class PGliteNoteRepository extends PGliteCRUDRepository<typeof noteTable> {}
class PoolNoteRepository extends DefaultCRUDRepository<typeof noteTable> {}

type TIsAny<T> = 0 extends 1 & T ? true : false;

const compileOnly = () => {
  // The short form takes a PGlite datasource and hands its client out as `PGlite`.
  const repository = new PGliteNoteRepository(pgliteDataSource);
  const client: PGlite = repository.dataSource.getClient();
  // @ts-expect-error the client is a PGlite, not a Pool
  const wrong: Pool = repository.dataSource.getClient();

  // @ts-expect-error a pg.Pool datasource is refused by the PGlite form
  new PGliteNoteRepository(poolDataSource);
  // @ts-expect-error a datasource of another engine is refused
  new PGliteNoteRepository(sqliteDataSource);
  // @ts-expect-error a value that is not a datasource is refused
  new PGliteNoteRepository({});

  // The pg default is untouched: a Pool datasource is accepted, a PGlite one is refused, and the client is a
  // `Pool`, not `any`.
  const poolRepository = new PoolNoteRepository(poolDataSource);
  const pool: Pool = poolRepository.dataSource.getClient();
  // @ts-expect-error the pg default still refuses a PGlite datasource
  new PoolNoteRepository(pgliteDataSource);
  const poolClientIsNotAny: TIsAny<ReturnType<typeof poolRepository.dataSource.getClient>> = false;
  const pgliteClientIsNotAny: TIsAny<ReturnType<typeof repository.dataSource.getClient>> = false;

  // The instance type annotates a variable.
  const annotated: PGliteCRUDRepository<typeof noteTable> = repository;

  return [client, wrong, pool, poolClientIsNotAny, pgliteClientIsNotAny, annotated];
};

describe('PGliteCRUDRepository - the short form for a repository on PGlite', () => {
  test('is the same class at runtime, so decorators and DI see DefaultCRUDRepository', () => {
    expect(PGliteCRUDRepository as unknown).toBe(DefaultCRUDRepository);
    expect(Object.getPrototypeOf(PGliteNoteRepository)).toBe(DefaultCRUDRepository);
  });

  test('the type-level checks in this file compile (tsc is the gate)', () => {
    expect(typeof compileOnly).toBe('function');
  });
});

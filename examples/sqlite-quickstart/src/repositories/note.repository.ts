import { SqliteDataSource } from '@/datasources/sqlite.datasource';
import { Note, TNoteSchema } from '@/models/note.model';
import { repository } from '@venizia/ignis';
import { DefaultSqliteRepository } from '@venizia/ignis/sqlite';

/**
 * Same shape as the Postgres tier: the repository classes are engine-neutral, and this one only
 * rebinds the SQLite datasource and options types.
 */
@repository({ model: Note, dataSource: SqliteDataSource })
export class NoteRepository extends DefaultSqliteRepository<TNoteSchema> {}

import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { Note, TNoteSchema } from '@/models/note.model';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

/**
 * The Postgres repository tier, unchanged: PGlite is a driver, and nothing above this line knows
 * which one is underneath.
 */
@repository({ model: Note, dataSource: PGliteDataSource })
export class NoteRepository extends DefaultCRUDRepository<TNoteSchema> {}

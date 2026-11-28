import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { Note, type noteTable } from '@/models/note.model';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';

/** Reads and writes notes, always inside the row scope of the `Note` model. */
@repository({ model: Note, dataSource: PGliteDataSource })
export class NoteRepository extends DefaultCRUDRepository<typeof noteTable> {}

import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { Note, noteTable } from '@/models/note.model';
import { repository } from '@venizia/ignis-kernel';
import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';

@repository({ model: Note, dataSource: PGliteDataSource })
export class NoteRepository extends DefaultCRUDRepository<typeof noteTable> {}

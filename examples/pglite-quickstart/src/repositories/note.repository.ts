import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { Note, noteTable } from '@/models/note.model';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Note, dataSource: PGliteDataSource })
export class NoteRepository extends DefaultCRUDRepository<typeof noteTable> {}

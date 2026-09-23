import { SqliteDataSource } from '@/datasources/sqlite.datasource';
import { Note, noteTable } from '@/models/note.model';
import { repository } from '@venizia/ignis';
import { DefaultSqliteRepository } from '@venizia/ignis/sqlite';

@repository({ model: Note, dataSource: SqliteDataSource })
export class NoteRepository extends DefaultSqliteRepository<typeof noteTable> {}

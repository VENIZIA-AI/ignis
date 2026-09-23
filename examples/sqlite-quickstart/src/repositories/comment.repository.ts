import { SqliteDataSource } from '@/datasources/sqlite.datasource';
import { Comment, commentTable } from '@/models/note.model';
import { repository } from '@venizia/ignis';
import { DefaultSqliteRepository } from '@venizia/ignis/sqlite';

@repository({ model: Comment, dataSource: SqliteDataSource })
export class CommentRepository extends DefaultSqliteRepository<typeof commentTable> {}

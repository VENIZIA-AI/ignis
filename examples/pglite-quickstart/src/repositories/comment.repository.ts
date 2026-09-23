import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { Comment, commentTable } from '@/models/note.model';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Comment, dataSource: PGliteDataSource })
export class CommentRepository extends DefaultCRUDRepository<typeof commentTable> {}

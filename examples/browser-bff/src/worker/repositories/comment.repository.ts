import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { Comment, commentTable } from '@/models/note.model';
import { repository } from '@venizia/ignis-kernel';
import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';

@repository({ model: Comment, dataSource: PGliteDataSource })
export class CommentRepository extends DefaultCRUDRepository<typeof commentTable> {}

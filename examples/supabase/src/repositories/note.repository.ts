import { SupabaseDataSource } from '@/datasources';
import { Note } from '@/models';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

/**
 * An ordinary repository. Nothing here knows about RLS - the rows it is allowed to see are decided
 * by the database, from the auth context the caller's transaction carries.
 */
@repository({ model: Note, dataSource: SupabaseDataSource })
export class NoteRepository extends DefaultCRUDRepository<typeof Note.schema> {}

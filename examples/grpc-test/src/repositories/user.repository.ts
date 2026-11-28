import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { User, type userTable } from '@/models/user.model';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';

/** Reads and writes users. */
@repository({ model: User, dataSource: PGliteDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof userTable> {}

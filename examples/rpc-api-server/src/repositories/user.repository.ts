import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { User, userTable } from '@/models/user.model';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: User, dataSource: PGliteDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof userTable> {}

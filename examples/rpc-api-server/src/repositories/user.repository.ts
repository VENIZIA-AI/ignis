import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { User, TUserSchema } from '@/models/entities';
import { ReadableRepository, repository } from '@venizia/ignis';

@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends ReadableRepository<TUserSchema> {}

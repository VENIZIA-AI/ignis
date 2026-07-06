import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { User, TUserSchema } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { ReadableRepository } from '@venizia/ignis/postgres';

@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends ReadableRepository<TUserSchema> {}

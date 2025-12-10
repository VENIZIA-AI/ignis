import { TUserSchema, User, userRelations } from '@/models/entities';
import { IDataSource, inject, ReadableRepository, repository } from '@venizia/ignis';

@repository({})
export class UserRepository extends ReadableRepository<TUserSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    super({ dataSource, entityClass: User, relations: userRelations.definitions });
  }
}
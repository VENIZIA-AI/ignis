import { User, TUserSchema } from '@/models/entities';
import { IDataSource, inject, repository, ViewRepository } from '@vez/ignis';

@repository({})
export class UserRepository extends ViewRepository<TUserSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    super({ dataSource, entityClass: User });
  }
}

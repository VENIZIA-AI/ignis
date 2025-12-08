import { User, TUserSchema } from '@/models/entities';
import { IDataSource, inject, repository, ReadableRepository } from '@vez/ignis';

@repository({})
export class UserRepository extends ReadableRepository<TUserSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    super({
      dataSource,
      entityClass: User,
      relations: {},
    });
  }
}

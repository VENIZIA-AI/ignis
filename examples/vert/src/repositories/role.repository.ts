import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Role } from '@/models/entities';
import { DefaultCRUDRepository, inject, repository } from '@venizia/ignis';

@repository({ model: Role, dataSource: PostgresDataSource })
export class RoleRepository extends DefaultCRUDRepository<typeof Role.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}

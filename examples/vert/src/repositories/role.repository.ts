import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Role } from '@/models/entities';
import { inject, repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Role, dataSource: PostgresDataSource })
export class RoleRepository extends DefaultCRUDRepository<typeof Role.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}

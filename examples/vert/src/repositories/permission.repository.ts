import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Permission } from '@/models/entities';
import { inject, repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Permission, dataSource: PostgresDataSource })
export class PermissionRepository extends DefaultCRUDRepository<typeof Permission.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}

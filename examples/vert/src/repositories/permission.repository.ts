import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Permission } from '@/models/entities';
import { DefaultCRUDRepository, inject, repository } from '@venizia/ignis';

@repository({ model: Permission, dataSource: PostgresDataSource })
export class PermissionRepository extends DefaultCRUDRepository<typeof Permission.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}

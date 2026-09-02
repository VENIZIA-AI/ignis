import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Permission } from '@/models/entities';
import { BindingKeys, BindingNamespaces, inject, repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Permission, dataSource: PostgresDataSource })
export class PermissionRepository extends DefaultCRUDRepository<typeof Permission.schema> {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.DATASOURCE,
        key: PostgresDataSource.name,
      }),
    })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}

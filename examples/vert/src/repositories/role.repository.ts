import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Role } from '@/models/entities';
import { BindingKeys, BindingNamespaces, inject, repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Role, dataSource: PostgresDataSource })
export class RoleRepository extends DefaultCRUDRepository<typeof Role.schema> {
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

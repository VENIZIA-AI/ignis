import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Organization } from '@/models/entities';
import { BindingKeys, BindingNamespaces, inject, repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Organization, dataSource: PostgresDataSource })
export class OrganizationRepository extends DefaultCRUDRepository<typeof Organization.schema> {
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

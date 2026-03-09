import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Organization } from '@/models/entities';
import { DefaultCRUDRepository, inject, repository } from '@venizia/ignis';

@repository({ model: Organization, dataSource: PostgresDataSource })
export class OrganizationRepository extends DefaultCRUDRepository<typeof Organization.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}

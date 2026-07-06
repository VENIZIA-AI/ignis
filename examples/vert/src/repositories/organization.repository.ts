import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Organization } from '@/models/entities';
import { inject, repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Organization, dataSource: PostgresDataSource })
export class OrganizationRepository extends DefaultCRUDRepository<typeof Organization.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}

import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { PolicyDefinition } from '@/models/entities';
import { DefaultCRUDRepository, inject, repository } from '@venizia/ignis';

@repository({ model: PolicyDefinition, dataSource: PostgresDataSource })
export class PolicyDefinitionRepository extends DefaultCRUDRepository<
  typeof PolicyDefinition.schema
> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}

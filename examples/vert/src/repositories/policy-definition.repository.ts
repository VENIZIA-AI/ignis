import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { PolicyDefinition } from '@/models/entities';
import { inject, repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

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

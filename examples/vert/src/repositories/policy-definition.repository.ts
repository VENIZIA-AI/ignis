import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { PolicyDefinition, policyDefinitionTable } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: PolicyDefinition, dataSource: PostgresDataSource })
export class PolicyDefinitionRepository extends DefaultCRUDRepository<
  typeof policyDefinitionTable
> {}

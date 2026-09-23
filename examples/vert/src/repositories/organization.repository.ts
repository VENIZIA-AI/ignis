import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Organization, organizationTable } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Organization, dataSource: PostgresDataSource })
export class OrganizationRepository extends DefaultCRUDRepository<typeof organizationTable> {}

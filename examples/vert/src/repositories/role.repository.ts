import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Role, roleTable } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Role, dataSource: PostgresDataSource })
export class RoleRepository extends DefaultCRUDRepository<typeof roleTable> {}

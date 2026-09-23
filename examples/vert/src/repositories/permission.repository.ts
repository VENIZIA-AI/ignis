import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Permission, permissionTable } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Permission, dataSource: PostgresDataSource })
export class PermissionRepository extends DefaultCRUDRepository<typeof permissionTable> {}

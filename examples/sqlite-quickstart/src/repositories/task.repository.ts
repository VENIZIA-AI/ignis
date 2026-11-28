import { SqliteDataSource } from '@/datasources/sqlite.datasource';
import { Task, type taskTable } from '@/models/task.model';
import { repository } from '@venizia/ignis';
import { DefaultSqliteRepository } from '@venizia/ignis-connectors/sqlite';

@repository({ model: Task, dataSource: SqliteDataSource })
export class TaskRepository extends DefaultSqliteRepository<typeof taskTable> {}

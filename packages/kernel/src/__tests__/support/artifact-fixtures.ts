import type { AbstractDataSource, IDataSource, TAnyDataSourceSchema } from '@/base/datasources';
import type { AbstractEntity } from '@/base/models';
import type { IRepository } from '@/base/repositories';

/** Structurally a datasource, so a typed `IArtifactIndex` accepts it without a cast; never configured. */
export class ProbeDataSource implements IDataSource {
  name = ProbeDataSource.name;
  settings = {};
  schema: TAnyDataSourceSchema = {};

  getSettings(): object {
    return this.settings;
  }

  getSchema(): TAnyDataSourceSchema {
    return this.schema;
  }

  configure(): Promise<void> {
    return Promise.resolve();
  }
}

/** Structurally a repository; the two members are declared, never assigned - registration reads the class, not an instance. */
export class ProbeRepository implements IRepository {
  dataSource!: AbstractDataSource;
  entity!: AbstractEntity;

  getEntity(): AbstractEntity {
    return this.entity;
  }
}

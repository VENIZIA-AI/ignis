import { ArtifactTypes, MetadataRegistry } from '@/helpers/inversion';
import type { IDataSourceMetadata } from '@/helpers/inversion';
import { getError } from '@venizia/ignis-helpers/core';
import { DataSourceOpenModes } from '../../datasources';
import { injectable, InjectableUtility } from '../injectable';

/**
 * Registers a datasource with driver and auto-discovery settings.
 *
 * @example
 * ```typescript
 * import { datasource } from '@venizia/ignis';
 * import { BasePostgresDataSource } from '@venizia/ignis-connectors/postgres';
 * import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';
 * import { Pool } from 'pg';
 *
 * export @datasource({ driver: NodePostgresDriver })
 * class AppDataSource extends BasePostgresDataSource<{ connectionString: string }> {
 *   constructor() { super({ name: AppDataSource.name, config: { connectionString: 'postgres://localhost/app' } }); }
 *   override configure(): void { this.client = new Pool(this.settings); }
 *   override getConnectionString(): string { return this.settings.connectionString; }
 * }
 * ```
 */
export const datasource = (metadata?: IDataSourceMetadata): ClassDecorator => {
  return (target) => {
    const openTimeout = metadata?.open?.timeoutMs;

    if (
      openTimeout !== undefined &&
      (typeof openTimeout !== 'number' || !Number.isInteger(openTimeout) || openTimeout < 0)
    ) {
      throw getError({
        message: `[datasource][@datasource][${target.name}] Invalid metadata | 'open.timeoutMs' must be a non-negative integer (ms; 0 waits for ever) | Got: ${String(openTimeout)}`,
      });
    }

    const openMode = metadata?.open?.on;

    // Untyped JS callers: a misspelt mode would silently mean "start", so it is refused where it is written.
    if (openMode !== undefined && !DataSourceOpenModes.isValid(openMode)) {
      throw getError({
        message: `[datasource][@datasource][${target.name}] Invalid metadata | Unknown 'open.on': ${String(openMode)} | Expected one of: ${[...DataSourceOpenModes.SCHEME_SET].join(', ')}`,
      });
    }

    injectable({
      type: ArtifactTypes.DATASOURCE,
      ...InjectableUtility.pickRegistrationOptions({ metadata: metadata ?? {} }),
    })(target);
    MetadataRegistry.getInstance().setDataSourceMetadata({ target, metadata });
  };
};

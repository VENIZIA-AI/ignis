import { BindingNamespaces } from '@/common/bindings';
import {
  BindingKeys,
  IDataSourceMetadata,
  IModelMetadata,
  IRepositoryMetadata,
  IResolvedRepositoryMetadata,
  MetadataRegistry,
} from '@/helpers/inversion';
import { getError, resolveClass, resolveValue } from '@venizia/ignis-helpers';
import { AbstractDataSource, IDataSource } from '../datasources';
import { BaseEntity } from '../models';
import { TTableSchemaWithId } from '../models/common';

/**
 * @model decorator - Registers a model class with its static schema and relations.
 *
 * Usage with static schema (Option A - Power Users):
 * ```typescript
 * @model({ type: 'entity' })
 * export class User extends BaseEntity {
 *   static schema = pgTable('User', { ... });
 *   static relations = () => ({ ... });
 * }
 * ```
 */
export const model = (metadata: IModelMetadata): ClassDecorator => {
  return target => {
    // Use registerModel which extracts static schema/relations and stores in registry
    // target is Function from ClassDecorator, which matches the union type in registerModel
    MetadataRegistry.getInstance().registerModel({ target, metadata });
  };
};

/**
 * @datasource decorator - Registers a datasource with driver and auto-discovery.
 *
 * The driver is automatically read by BaseDataSource from this decorator,
 * so you don't need to pass it in the constructor.
 *
 * Usage:
 * ```typescript
 * @datasource({ driver: 'node-postgres' })
 * export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDbConfig> {
 *   constructor() {
 *     super({
 *       name: PostgresDataSource.name,
 *       config: { host: '...', port: 5432, ... },
 *       // driver read from decorator - no need to pass here!
 *       // schema auto-discovered from repositories
 *     });
 *   }
 * }
 * ```
 */
export const datasource = (metadata: IDataSourceMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setDataSourceMetadata({ target, metadata });
  };
};

/**
 * Validate repository metadata - both model and dataSource must be provided together.
 */
const validateRepositoryMetadata = <
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
  DataSource extends IDataSource = IDataSource,
>(opts: {
  metadata: IRepositoryMetadata<Schema, Model, DataSource>;
  target: Function;
}): void => {
  const { metadata, target } = opts;

  if (!metadata.model) {
    throw getError({
      message: `[validateRepositoryMetadata][@repository][${target.name}] Invalid metadata | Missing 'model'`,
    });
  }

  if (!metadata.dataSource) {
    throw getError({
      message: `[validateRepositoryMetadata][@repository][${target.name}] Invalid metadata | Missing 'dataSource'`,
    });
  }
};

/**
 * Register dataSource injection metadata if not already explicitly defined.
 * Validates that first constructor param is a DataSource.
 */
const registerDataSourceInjection = (opts: {
  target: Function;
  registry: MetadataRegistry;
  resolvedDataSource: string | Function;
}): void => {
  const { target, registry, resolvedDataSource } = opts;

  // 1. Get constructor parameter types using reflection metadata
  const paramTypes = Reflect.getMetadata('design:paramtypes', target);
  const firstParamType = paramTypes?.[0];

  // 2. Validate first parameter type must satisfy IDataSource (extend AbstractDataSource)
  if (firstParamType) {
    // Check if firstParamType extends AbstractDataSource
    const isDataSourceType =
      firstParamType === AbstractDataSource ||
      firstParamType.prototype instanceof AbstractDataSource;

    if (!isDataSourceType) {
      throw getError({
        message: `[@repository][${target.name}] Invalid constructor | First parameter must extend AbstractDataSource | Received: '${firstParamType.name}'`,
      });
    }

    // Additionally validate that resolvedDataSource is compatible with firstParamType
    if (typeof resolvedDataSource === 'function') {
      const isCompatible =
        firstParamType === resolvedDataSource ||
        resolvedDataSource.prototype instanceof firstParamType;

      if (!isCompatible) {
        throw getError({
          message: `[@repository][${target.name}] Invalid constructor | Type mismatch | Constructor expects '${firstParamType.name}' but @repository specifies '${resolvedDataSource.name}'`,
        });
      }
    }
  }

  // Check if user already has explicit @inject for param 0
  const existingInjects = registry.getInjectMetadata({ target });
  const injectAtIndex0 = existingInjects?.find(m => m.index === 0);

  if (injectAtIndex0) {
    // Validate that the explicit @inject at param 0 is a DataSource
    const injectKey = injectAtIndex0.key;
    const isDataSourceKey =
      typeof injectKey === 'string' && injectKey.startsWith(`${BindingNamespaces.DATASOURCE}.`);

    if (!isDataSourceKey) {
      throw getError({
        message: `[@repository][${target.name}] Invalid constructor | First parameter must be a DataSource | Found @inject with key: '${injectKey.toString()}' | Expected key starting with '${BindingNamespaces.DATASOURCE}.'`,
      });
    }

    // User has valid explicit @inject for DataSource, skip auto-injection
    return;
  }

  // Build binding key and register injection metadata
  const dsName =
    typeof resolvedDataSource === 'string' ? resolvedDataSource : resolvedDataSource.name;
  const dsBindingKey = BindingKeys.build({ namespace: BindingNamespaces.DATASOURCE, key: dsName });

  registry.setInjectMetadata({
    target,
    index: 0,
    metadata: { key: dsBindingKey, index: 0, isOptional: false },
  });
};

/**
 * Resolve repository metadata and register bindings if model and dataSource are provided.
 */
const resolveRepositoryMetadata = <
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
  DataSource extends IDataSource = IDataSource,
>(opts: {
  metadata: IRepositoryMetadata<Schema, Model, DataSource>;
  target: Function;
  registry: MetadataRegistry;
}): IResolvedRepositoryMetadata<Schema, Model, DataSource> | undefined => {
  const { metadata, target, registry } = opts;

  // Validate metadata - throws if invalid
  validateRepositoryMetadata({ metadata, target });

  // Early return if neither model nor dataSource provided (valid case)
  if (!metadata.model || !metadata.dataSource) {
    return undefined;
  }

  const resolvedModel = resolveValue(metadata.model);
  const resolvedDataSource = resolveClass(metadata.dataSource);

  // Register the binding for auto-discovery
  registry.registerRepositoryBinding({
    repository: target,
    model: resolvedModel,
    dataSource: resolvedDataSource,
  });

  // Auto-inject dataSource at constructor parameter index 0
  registerDataSourceInjection({ target, registry, resolvedDataSource });

  return {
    model: resolvedModel,
    dataSource: resolvedDataSource,
    operationScope: metadata.operationScope,
  };
};

/**
 * @repository decorator - Binds a repository to a model and datasource.
 *
 * IMPORTANT: Both `model` AND `dataSource` are required for schema auto-discovery.
 * Without both, the model won't be registered and relational queries will fail.
 *
 * Supports these injection patterns:
 *
 * 1. Zero boilerplate - dataSource auto-injected from metadata:
 * ```typescript
 * @repository({ model: User, dataSource: PostgresDataSource })
 * export class UserRepository extends PersistableRepository<typeof User.schema> {
 *   // No constructor needed - datasource auto-injected at param index 0
 * }
 * ```
 *
 * 2. Explicit @inject with @repository - when you need constructor control:
 * ```typescript
 * @repository({ model: User, dataSource: PostgresDataSource })
 * export class UserRepository extends PersistableRepository<typeof User.schema> {
 *   constructor(
 *     @inject({ key: 'datasources.PostgresDataSource' })
 *     ds: PostgresDataSource,
 *   ) {
 *     super(ds, { entityClass: User });
 *   }
 * }
 * ```
 * Note: When @inject is at param index 0, auto-injection is skipped (your @inject takes precedence).
 */
export const repository = <
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
  DataSource extends IDataSource = IDataSource,
>(
  metadata: IRepositoryMetadata<Schema, Model, DataSource>,
): ClassDecorator => {
  return target => {
    const registry = MetadataRegistry.getInstance();
    const resolved = resolveRepositoryMetadata({ metadata, target, registry });

    // Store metadata with resolved references
    registry.setRepositoryMetadata({
      target,
      metadata: { ...metadata, _resolved: resolved } as IRepositoryMetadata & {
        _resolved?: IResolvedRepositoryMetadata;
      },
    });
  };
};

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

/** Registers a model class with its static schema and relations. */
export const model = (metadata: IModelMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().registerModel({ target, metadata });
  };
};

/** Registers a datasource with driver and auto-discovery settings. */
export const datasource = (metadata: IDataSourceMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setDataSourceMetadata({ target, metadata });
  };
};

/** Validates that both model and dataSource are provided together. */
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

/** Auto-injects dataSource at constructor param[0] unless explicit @inject exists. */
const registerDataSourceInjection = (opts: {
  target: Function;
  registry: MetadataRegistry;
  resolvedDataSource: string | Function;
}): void => {
  const { target, registry, resolvedDataSource } = opts;

  const paramTypes = Reflect.getMetadata('design:paramtypes', target);
  const firstParamType = paramTypes?.[0];

  if (firstParamType) {
    const isDataSourceType =
      firstParamType === AbstractDataSource ||
      firstParamType.prototype instanceof AbstractDataSource;

    if (!isDataSourceType) {
      throw getError({
        message: `[@repository][${target.name}] Invalid constructor | First parameter must extend AbstractDataSource | Received: '${firstParamType.name}'`,
      });
    }

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

  const existingInjects = registry.getInjectMetadata({ target });
  const injectAtIndex0 = existingInjects?.find(m => m.index === 0);

  if (injectAtIndex0) {
    const injectKey = injectAtIndex0.key;
    const isDataSourceKey =
      typeof injectKey === 'string' && injectKey.startsWith(`${BindingNamespaces.DATASOURCE}.`);

    if (!isDataSourceKey) {
      throw getError({
        message: `[@repository][${target.name}] Invalid constructor | First parameter must be a DataSource | Found @inject with key: '${injectKey.toString()}' | Expected key starting with '${BindingNamespaces.DATASOURCE}.'`,
      });
    }

    return;
  }

  const dsName =
    typeof resolvedDataSource === 'string' ? resolvedDataSource : resolvedDataSource.name;
  const dsBindingKey = BindingKeys.build({ namespace: BindingNamespaces.DATASOURCE, key: dsName });

  registry.setInjectMetadata({
    target,
    index: 0,
    metadata: { key: dsBindingKey, index: 0, isOptional: false },
  });
};

/** Resolves repository metadata and registers bindings for schema auto-discovery. */
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

  validateRepositoryMetadata({ metadata, target });

  if (!metadata.model || !metadata.dataSource) {
    return undefined;
  }

  const resolvedModel = resolveValue(metadata.model);
  const resolvedDataSource = resolveClass(metadata.dataSource);

  registry.registerRepositoryBinding({
    repository: target,
    model: resolvedModel,
    dataSource: resolvedDataSource,
  });

  registerDataSourceInjection({ target, registry, resolvedDataSource });

  return {
    model: resolvedModel,
    dataSource: resolvedDataSource,
    operationScope: metadata.operationScope,
  };
};

/** Binds a repository to a model and datasource for schema auto-discovery. */
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

    registry.setRepositoryMetadata({
      target,
      metadata: { ...metadata, _resolved: resolved } as IRepositoryMetadata & {
        _resolved?: IResolvedRepositoryMetadata;
      },
    });
  };
};

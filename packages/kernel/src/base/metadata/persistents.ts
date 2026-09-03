import { BindingNamespaces } from '@/common/bindings';
import type {
  IDataSourceMetadata,
  IInjectMetadata,
  IModelMetadata,
  IRepositoryMetadata,
  IResolvedRepositoryMetadata,
} from '@/helpers/inversion';
import { BindingKeys, MetadataKeys, MetadataRegistry } from '@/helpers/inversion';
import { resolveClass, resolveValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { IDataSource } from '../datasources';
import { isDataSourceClass } from '../datasources';
import type { AbstractEntity } from '../models';

/** Registers a model class with its static schema and relations. */
export const model = (metadata: IModelMetadata): ClassDecorator => {
  return target => {
    const defaultLimit = metadata.settings?.defaultLimit;
    if (defaultLimit !== undefined && (!Number.isInteger(defaultLimit) || defaultLimit <= 0)) {
      throw getError({
        message: `[model][${target.name}] Invalid 'defaultLimit' | Expected a positive integer | Got: ${defaultLimit}`,
      });
    }

    // Validated at DECORATION time, like defaultLimit: a bad ceiling is a wiring mistake, and
    // catching it at boot beats catching it on the one request that happens to reach the limit.
    const maxLimit = metadata.settings?.maxLimit;
    if (maxLimit !== undefined && (!Number.isInteger(maxLimit) || maxLimit <= 0)) {
      throw getError({
        message: `[model][${target.name}] Invalid 'maxLimit' | Expected a positive integer | Got: ${maxLimit}`,
      });
    }

    // Auto-populate AUTHORIZATION_SUBJECT from authorize.principal if not already set
    const principal = metadata.settings?.authorize?.principal;
    if (principal && !Object.hasOwn(target, 'AUTHORIZATION_SUBJECT')) {
      (target as Record<string, unknown>).AUTHORIZATION_SUBJECT = principal;
    }

    MetadataRegistry.getInstance().registerModel({ target, metadata });
  };
};

/** Registers a datasource with driver and auto-discovery settings. */
export const datasource = (metadata?: IDataSourceMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setDataSourceMetadata({ target, metadata });
  };
};

/** Validates that both model and dataSource are provided together. */
const validateRepositoryMetadata = <
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
>(opts: {
  metadata: IRepositoryMetadata<Model, DataSource>;
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

/** Asserts the constructor's first parameter is an AbstractDataSource compatible with what @repository declared. */
const validateFirstConstructorParameter = (opts: {
  target: Function;
  firstParamType: Function;
  resolvedDataSource: string | Function;
}): void => {
  const { target, firstParamType, resolvedDataSource } = opts;

  // NOT `instanceof`: two copies of this package give two `AbstractDataSource` classes and the
  // check would be false across them, rejecting a perfectly valid repository at import time.
  const isDataSourceType = isDataSourceClass(firstParamType);

  if (!isDataSourceType) {
    throw getError({
      message: `[@repository][${target.name}] Invalid constructor | First parameter must extend AbstractDataSource | Received: '${firstParamType.name}'`,
    });
  }

  if (typeof resolvedDataSource !== 'function') {
    return;
  }

  const isCompatible =
    firstParamType === resolvedDataSource || resolvedDataSource.prototype instanceof firstParamType;

  if (!isCompatible) {
    throw getError({
      message: `[@repository][${target.name}] Invalid constructor | Type mismatch | Constructor expects '${firstParamType.name}' but @repository specifies '${resolvedDataSource.name}'`,
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
    validateFirstConstructorParameter({ target, firstParamType, resolvedDataSource });
  }

  // Own metadata only: `getInjectMetadata` walks the prototype chain, so a repository extending another @repository class would see the BASE's injection at param[0] and silently resolve the base's dataSource.
  const ownInjects: IInjectMetadata[] | undefined = Reflect.getOwnMetadata(
    MetadataKeys.INJECT,
    target,
  );
  const injectAtIndex0 = ownInjects?.find(entry => entry?.index === 0);

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

  // Copy-on-write for the same reason: setInjectMetadata mutates the array it reads through the prototype chain, which would rewrite the base repository's param[0] with this class's key.
  if (!ownInjects) {
    const inheritedInjects = registry.getInjectMetadata({ target });
    Reflect.defineMetadata(MetadataKeys.INJECT, [...(inheritedInjects ?? [])], target);
  }

  registry.setInjectMetadata({
    target,
    index: 0,
    metadata: { key: dsBindingKey, index: 0, isOptional: false },
  });
};

/** Resolves repository metadata and registers bindings for schema auto-discovery. */
const resolveRepositoryMetadata = <
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
>(opts: {
  metadata: IRepositoryMetadata<Model, DataSource>;
  target: Function;
  registry: MetadataRegistry;
}): IResolvedRepositoryMetadata<Model, DataSource> | undefined => {
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
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
>(
  metadata: IRepositoryMetadata<Model, DataSource>,
): ClassDecorator => {
  return target => {
    const registry = MetadataRegistry.getInstance();
    const resolved = resolveRepositoryMetadata({ metadata, target, registry });

    // `_resolved` is an internal cache field, not part of the public IRepositoryMetadata surface callers author - it is added here, so the merged literal needs the widened local type.
    registry.setRepositoryMetadata({
      target,
      metadata: { ...metadata, _resolved: resolved } as IRepositoryMetadata<Model, DataSource> & {
        _resolved?: IResolvedRepositoryMetadata<Model, DataSource>;
      },
    });
  };
};

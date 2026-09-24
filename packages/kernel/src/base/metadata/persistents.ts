import { BindingNamespaces } from '@/common/bindings';
import type {
  IArtifactRegistrationOptions,
  IDataSourceMetadata,
  IInjectMetadata,
  IModelMetadata,
  IResolvedRepositoryMetadata,
  TRepositoryMetadata,
} from '@/helpers/inversion';
import {
  ArtifactTypes,
  BindingKeys,
  MetadataKeys,
  MetadataRegistry,
  resolveInjectTarget,
} from '@/helpers/inversion';
import { resolveClass, resolveValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { IDataSource } from '../datasources';
import { isDataSourceClass } from '../datasources';
import type { AbstractEntity } from '../models';
import { RepositoryTypes } from '../repositories/common/constants';
import { injectable, pickRegistrationOptions } from './injectable';

/** Registers a model class with its static schema and relations. */
export const model = (metadata: IModelMetadata): ClassDecorator => {
  return target => {
    injectable({ type: ArtifactTypes.MODEL, ...pickRegistrationOptions({ metadata }) })(target);

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
    injectable({
      type: ArtifactTypes.DATASOURCE,
      ...pickRegistrationOptions({ metadata: metadata ?? {} }),
    })(target);
    MetadataRegistry.getInstance().setDataSourceMetadata({ target, metadata });
  };
};

/** Mirrors the `TRepositoryMetadata` union for JavaScript callers: a known type, a dataSource always, a model exactly when the type is RepositoryTypes.MODEL. */
const validateRepositoryMetadata = <
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
>(opts: {
  metadata: TRepositoryMetadata<Model, DataSource>;
  target: Function;
}): void => {
  const { metadata, target } = opts;
  const type = metadata.type ?? RepositoryTypes.MODEL;

  if (!RepositoryTypes.isValid(type)) {
    throw getError({
      message: `[validateRepositoryMetadata][@repository][${target.name}] Invalid metadata | Unknown 'type': ${type} | Expected one of: ${[...RepositoryTypes.SCHEME_SET].join(', ')}`,
    });
  }

  if (type === RepositoryTypes.MODEL && !metadata.model) {
    throw getError({
      message: `[validateRepositoryMetadata][@repository][${target.name}] Invalid metadata | Missing 'model'`,
    });
  }

  if (type === RepositoryTypes.REMOTE && metadata.model) {
    throw getError({
      message: `[validateRepositoryMetadata][@repository][${target.name}] Invalid metadata | A '${RepositoryTypes.REMOTE}' repository takes no 'model'`,
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
    // `@inject({ target })` carries no key; read the one recorded on the class. The function form
    // resolves through the same helper the container uses, so both paths read one class.
    const injectedTarget = injectAtIndex0.target
      ? resolveInjectTarget({ target: injectAtIndex0.target })
      : undefined;
    const injectKey =
      injectAtIndex0.key ??
      (injectedTarget ? registry.getBindingKey({ target: injectedTarget }) : undefined);

    // A datasource registered by hand gets its key from `this.dataSource()`, after this decorator
    // runs, so an unkeyed target is judged by its class instead.
    const isDataSourceTarget =
      typeof injectKey === 'string'
        ? injectKey.startsWith(`${BindingNamespaces.DATASOURCE}.`)
        : isDataSourceClass(injectedTarget);

    if (!isDataSourceTarget) {
      throw getError({
        message: `[@repository][${target.name}] Invalid constructor | First parameter must be a DataSource | Found @inject with key: '${String(injectKey)}' | Expected a key starting with '${BindingNamespaces.DATASOURCE}.' or a DataSource class`,
      });
    }

    return;
  }

  const dsName =
    typeof resolvedDataSource === 'string' ? resolvedDataSource : resolvedDataSource.name;
  const dsBindingKey = BindingKeys.build({ namespace: BindingNamespaces.DATASOURCE, key: dsName });

  // The inherited list is the base repository's own, and setInjectMetadata may write straight into it.
  if (!ownInjects) {
    Reflect.defineMetadata(
      MetadataKeys.INJECT,
      [...(registry.getInjectMetadata({ target }) ?? [])],
      target,
    );
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
  metadata: TRepositoryMetadata<Model, DataSource>;
  target: Function;
  registry: MetadataRegistry;
}): IResolvedRepositoryMetadata<Model, DataSource> => {
  const { metadata, target, registry } = opts;

  validateRepositoryMetadata({ metadata, target });

  const resolvedDataSource = resolveClass({ ref: metadata.dataSource });

  // No model, so no binding: the datasource owns no schema through this repository.
  if (metadata.type === RepositoryTypes.REMOTE) {
    registerDataSourceInjection({ target, registry, resolvedDataSource });
    return {
      type: RepositoryTypes.REMOTE,
      dataSource: resolvedDataSource,
      operationScope: metadata.operationScope,
    };
  }

  const resolvedModel = resolveValue({ value: metadata.model });

  registry.registerRepositoryBinding({
    repository: target,
    model: resolvedModel,
    dataSource: resolvedDataSource,
  });

  registerDataSourceInjection({ target, registry, resolvedDataSource });

  return {
    type: RepositoryTypes.MODEL,
    model: resolvedModel,
    dataSource: resolvedDataSource,
    operationScope: metadata.operationScope,
  };
};

/** A bare `@repository()` on a subclass reuses the type, model and datasource its nearest decorated parent declared; the registration options (`binding`, `when`, ...) are never inherited, so the subclass registers under its own name. */
const inheritRepositoryMetadata = (opts: {
  target: Function;
  registry: MetadataRegistry;
}): TRepositoryMetadata => {
  // Own metadata does not exist yet at decoration time, so this read walks the prototype chain.
  const inherited = opts.registry.getRepositoryMetadata({ target: opts.target });
  if (!inherited) {
    throw getError({
      message: `[@repository][${opts.target.name}] No metadata given and no decorated repository above it in the prototype chain | pass { model, dataSource } or decorate the parent`,
    });
  }

  if (inherited.type === RepositoryTypes.REMOTE) {
    const { type, dataSource, operationScope } = inherited;
    return { type, dataSource, operationScope };
  }

  const { type, model: parentModel, dataSource, operationScope } = inherited;
  return { type, model: parentModel, dataSource, operationScope };
};

const applyRepositoryMetadata = <
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
>(opts: {
  metadata: TRepositoryMetadata<Model, DataSource>;
  registration: IArtifactRegistrationOptions;
  target: Function;
  registry: MetadataRegistry;
}): void => {
  const { metadata, registration, target, registry } = opts;
  injectable({
    type: ArtifactTypes.REPOSITORY,
    ...pickRegistrationOptions({ metadata: registration }),
  })(target);

  const resolved = resolveRepositoryMetadata({ metadata, target, registry });

  registry.setRepositoryMetadata({ target, metadata: { ...metadata, _resolved: resolved } });
};

export const repository = <
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
>(
  metadata?: TRepositoryMetadata<Model, DataSource>,
): ClassDecorator => {
  return target => {
    const registry = MetadataRegistry.getInstance();
    if (!metadata) {
      applyRepositoryMetadata({
        metadata: inheritRepositoryMetadata({ target, registry }),
        registration: {},
        target,
        registry,
      });
      return;
    }

    applyRepositoryMetadata({ metadata, registration: metadata, target, registry });
  };
};

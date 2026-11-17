import type { TRepositoryMetadata } from '@/helpers/inversion';
import { getError } from '@venizia/ignis-helpers/core';
import type { IDataSource } from '../../../datasources';
import { isDataSourceClass } from '../../../datasources';
import type { AbstractEntity } from '../../../models';
import { RepositoryTypes } from '../../../repositories/common/constants';

/** Mirrors the `TRepositoryMetadata` union for JavaScript callers: a known type, a dataSource always, a model exactly when the type is RepositoryTypes.MODEL. */
export const validateRepositoryMetadata = <
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

/** Asserts the constructor's first parameter is a datasource class (`AbstractDataSource` or the `DataSourceRoot` it extends) compatible with what @repository declared. */
export const validateFirstConstructorParameter = (opts: {
  target: Function;
  firstParamType: Function;
  resolvedDataSource: string | Function;
}): void => {
  const { target, firstParamType, resolvedDataSource } = opts;

  // NOT `instanceof`: two copies of this package give two `DataSourceRoot` classes and the
  // check would be false across them, rejecting a perfectly valid repository at import time.
  const isDataSourceType = isDataSourceClass(firstParamType);

  if (!isDataSourceType) {
    throw getError({
      message: `[@repository][${target.name}] Invalid constructor | First parameter must extend AbstractDataSource (or DataSourceRoot) | Received: '${firstParamType.name}'`,
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

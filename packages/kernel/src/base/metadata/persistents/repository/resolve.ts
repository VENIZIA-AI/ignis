import type {
  IArtifactRegistrationOptions,
  IResolvedRepositoryMetadata,
  MetadataRegistry,
  TRepositoryMetadata,
} from '@/helpers/inversion';
import { ArtifactTypes } from '@/helpers/inversion';
import { ClassResolver, ResolverUtility } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { IDataSource } from '../../../datasources';
import type { AbstractEntity } from '../../../models';
import { RepositoryTypes } from '../../../repositories/common/constants';
import { injectable, InjectableUtility } from '../../injectable';
import { registerDataSourceInjection } from './injection';
import { validateRepositoryMetadata } from './validate';

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

  const resolvedDataSource = ClassResolver.resolveClass({ ref: metadata.dataSource });

  if (!resolvedDataSource) {
    throw getError({
      message: `[@repository][${target.name}] The dataSource resolver returned nothing at decoration time | An import cycle leaves the datasource class undefined here; import it without the cycle, or name it as a string`,
    });
  }

  // No model, so no binding: the datasource owns no schema through this repository.
  if (metadata.type === RepositoryTypes.REMOTE) {
    registerDataSourceInjection({
      target,
      registry,
      dataSourceRef: metadata.dataSource,
      resolvedDataSource,
    });

    return {
      type: RepositoryTypes.REMOTE,
      dataSource: resolvedDataSource,
      operationScope: metadata.operationScope,
    };
  }

  const resolvedModel = ResolverUtility.resolveValue({ value: metadata.model });

  registry.registerRepositoryBinding({
    repository: target,
    model: resolvedModel,
    dataSource: resolvedDataSource,
  });

  registerDataSourceInjection({
    target,
    registry,
    dataSourceRef: metadata.dataSource,
    resolvedDataSource,
  });

  return {
    type: RepositoryTypes.MODEL,
    model: resolvedModel,
    dataSource: resolvedDataSource,
    operationScope: metadata.operationScope,
  };
};

/** A bare `@repository()` on a subclass reuses the type, model and datasource its nearest decorated parent declared; the registration options (`binding`, `when`, ...) are never inherited, so the subclass registers under its own name. */
export const inheritRepositoryMetadata = (opts: {
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

export const applyRepositoryMetadata = <
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
    ...InjectableUtility.pickRegistrationOptions({ metadata: registration }),
  })(target);

  const resolved = resolveRepositoryMetadata({ metadata, target, registry });

  registry.setRepositoryMetadata({ target, metadata: { ...metadata, _resolved: resolved } });
};

import type { AnyType, TClass } from '@venizia/ignis-helpers/common';
import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { SingletonRealm } from '../singleton-realm';
import type { IModelRegistryEntry, IRepositoryBinding } from './common/types';
import {
  ArtifactMetadataMixin,
  ControllerMetadataMixin,
  DatasourceMetadataMixin,
  GrpcControllerMetadataMixin,
  ModelMetadataMixin,
  RepositoryMetadataMixin,
  RestControllerMetadataMixin,
} from './mixins';

const BaseRegistry = ArtifactMetadataMixin(
  GrpcControllerMetadataMixin(
    RestControllerMetadataMixin(
      ControllerMetadataMixin(
        RepositoryMetadataMixin(ModelMetadataMixin(DatasourceMetadataMixin(_MetadataRegistry))),
      ),
    ),
  ),
);

/** Central metadata registry: decorator metadata, the model registry, repository bindings and auto-discovery. */
export class MetadataRegistry extends BaseRegistry {
  static readonly SINGLETON_REAL_KEY = 'metadata-registry';

  private constructor() {
    super();
    this.modelRegistry = new Map<string, IModelRegistryEntry>();
    this.repositoryBindings = new Map<string, IRepositoryBinding>();
    this.datasourceModels = new Map<string, Set<TClass<AnyType>>>();
  }

  static getInstance(): MetadataRegistry {
    return SingletonRealm.resolve({
      key: MetadataRegistry.SINGLETON_REAL_KEY,
      create: () => new MetadataRegistry(),
    });
  }

  clearAll(): void {
    this.modelRegistry.clear();
    this.repositoryBindings.clear();
    this.datasourceModels.clear();
  }
}

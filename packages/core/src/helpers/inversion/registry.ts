import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import type { IModelRegistryEntry, IRepositoryBinding } from './common/types';
import {
    ControllerMetadataMixin,
    DatasourceMetadataMixin,
    GrpcControllerMetadataMixin,
    ModelMetadataMixin,
    RepositoryMetadataMixin,
    RestControllerMetadataMixin,
} from './mixins';

const _BaseRegistry = GrpcControllerMetadataMixin(
  RestControllerMetadataMixin(
    ControllerMetadataMixin(
      RepositoryMetadataMixin(ModelMetadataMixin(DatasourceMetadataMixin(_MetadataRegistry))),
    ),
  ),
);

/**

 * Central metadata registry for storing and retrieving decorator metadata.
 * Enhanced with model registry, repository bindings, and auto-discovery capabilities.
 */
export class MetadataRegistry extends _BaseRegistry {
  private static instance: MetadataRegistry;

  private constructor() {
    super();
    this.modelRegistry = new Map<
      string, // table name
      IModelRegistryEntry // register entiry
    >();
    this.repositoryBindings = new Map<string, IRepositoryBinding>();
    this.datasourceModels = new Map<string, Set<string>>();
  }

  static getInstance(): MetadataRegistry {
    if (!MetadataRegistry.instance) {
      MetadataRegistry.instance = new MetadataRegistry();
    }
    return MetadataRegistry.instance;
  }

  clearAll(): void {
    this.modelRegistry.clear();
    this.repositoryBindings.clear();
    this.datasourceModels.clear();
  }
}

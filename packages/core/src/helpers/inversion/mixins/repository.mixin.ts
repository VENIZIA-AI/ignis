import { IDataSource } from '@/base/datasources';
import { AbstractEntity } from '@/base/models';
import type { TTableSchemaWithId } from '@/connectors/postgres/models';
// Deep import ON PURPOSE - the repositories barrel pulls PostgresBaseRepository, which extends
// base AbstractRepository and would close a circular import back into this registry (TDZ at load).
import { createRelations } from '@/connectors/postgres/repositories/operators/relation';
import type { TRelationConfig } from '@/connectors/postgres/repositories/common';
import { resolveValue, TClass, TMixinTarget } from '@venizia/ignis-helpers';
import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../common/keys';
import {
  IModelMetadata,
  IModelRegistryEntry,
  IRepositoryBinding,
  IRepositoryMetadata,
  IResolvedRepositoryMetadata,
} from '../common/types';

// Repository Metadata & Bindings
export const RepositoryMetadataMixin = <
  BaseClass extends TMixinTarget<
    _MetadataRegistry & {
      modelRegistry: Map<string, IModelRegistryEntry>;
      getModelMetadata(opts: { target: object }): IModelMetadata | undefined;
    }
  >,
>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    repositoryBindings: Map<string, IRepositoryBinding<AbstractEntity>>;

    // DataSource -> Models mapping: datasource name -> set of model table names
    datasourceModels: Map<string, Set<string>>;

    setRepositoryMetadata<
      Target extends object = object,
      Model extends AbstractEntity = AbstractEntity,
      DataSource extends IDataSource = IDataSource,
    >(opts: { target: Target; metadata: IRepositoryMetadata<Model, DataSource> }): void {
      const { target, metadata } = opts;
      Reflect.defineMetadata(MetadataKeys.REPOSITORY, metadata, target);
    }

    getRepositoryMetadata<Target extends object = object>(opts: {
      target: Target;
    }): (IRepositoryMetadata & { _resolved?: IResolvedRepositoryMetadata }) | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.REPOSITORY, target);
    }

    /** Registers a repository binding (called by @repository) linking a repository to its model + datasource. */
    registerRepositoryBinding<
      Model extends AbstractEntity = AbstractEntity,
      DataSource extends IDataSource = IDataSource,
    >(opts: IRepositoryBinding<Model, DataSource>) {
      this.repositoryBindings.set(opts.repository.name, opts);

      // Track which datasource owns which models
      const dsKey = typeof opts.dataSource === 'string' ? opts.dataSource : opts.dataSource.name;

      const modelClass = resolveValue(opts.model);

      const modelMetadata = this.getModelMetadata({ target: modelClass });
      const tableName = modelMetadata?.tableName || modelClass.TABLE_NAME || modelClass.name;

      if (!this.datasourceModels.has(dsKey)) {
        this.datasourceModels.set(dsKey, new Set());
      }

      this.datasourceModels.get(dsKey)!.add(tableName);
    }

    getRepositoryBinding(opts: { name: string }): IRepositoryBinding<AbstractEntity> | undefined {
      return this.repositoryBindings.get(opts.name);
    }

    /**
     * Resolves + caches relations for a model entry. Called lazily from buildSchema() so every
     * @model class is registered first, avoiding circular-dependency ordering issues. @internal
     */
    resolveModelRelations(modelMeta: IModelRegistryEntry): unknown {
      if (modelMeta._builtRelations !== undefined) {
        return modelMeta._builtRelations;
      }

      if (!modelMeta.relationsResolver) {
        return undefined;
      }

      const relations = resolveValue(modelMeta.relationsResolver) as Array<TRelationConfig>;

      if (relations && modelMeta.schema) {
        // Registry stores schema as unknown (engine-neutral); this resolver only runs for
        // drizzle-backed models, so the narrow is safe here.
        const builtRelations = createRelations({
          source: modelMeta.schema as TTableSchemaWithId,
          relations,
        });

        modelMeta._builtRelations = builtRelations?.relations;
        return modelMeta._builtRelations;
      }

      return undefined;
    }

    /**
     * Models registered for a datasource, relations resolved lazily. `schema`/`relations` are
     * `unknown` because this registry is shared across connectors (SQL vs search); each connector
     * narrows the type at its own call site (e.g. `BasePostgresDataSource.discoverSchema()`).
     */
    getModels(opts: { dataSource: string | TClass<IDataSource> }): Array<{
      tableName: string;
      schema: unknown;
      relations?: unknown;
    }> {
      const { dataSource } = opts;
      const dsKey = typeof dataSource === 'string' ? dataSource : dataSource.name;
      const modelNames = this.datasourceModels.get(dsKey) || new Set();

      const rs = Array.from(modelNames)
        .map(tableName => {
          if (!this.modelRegistry.has(tableName)) {
            return null;
          }

          const modelMeta = this.modelRegistry.get(tableName);
          if (!modelMeta) {
            return null;
          }

          const relations = this.resolveModelRelations(modelMeta);

          return {
            tableName,
            schema: modelMeta.schema,
            relations,
          };
        })
        .filter((item): item is NonNullable<typeof item> => {
          return item !== undefined && item !== null;
        });

      return rs;
    }

    /** Like getModels but returns only resolved model classes — used by BaseSearchDataSource, which has no pgTable to resolve. */
    getModelClasses(opts: { dataSource: string | TClass<IDataSource> }): Array<TClass<unknown>> {
      const { dataSource } = opts;
      const dsKey = typeof dataSource === 'string' ? dataSource : dataSource.name;
      const modelNames = this.datasourceModels.get(dsKey) || new Set();

      const rs = Array.from(modelNames)
        .map(tableName => {
          const modelMeta = this.modelRegistry.get(tableName);
          if (!modelMeta) {
            return null;
          }

          return resolveValue(modelMeta.target);
        })
        .filter(item => item !== null);

      return rs;
    }

    /** Assembles table schemas + relations for a datasource's registered models. */
    buildSchema(opts: { dataSource: string | TClass<IDataSource> }): {
      schema: Record<string, unknown>;
      relations: Record<string, unknown>;
    } {
      const { dataSource } = opts;
      const models = this.getModels({ dataSource });

      const rs: {
        schema: Record<string, unknown>;
        relations: Record<string, unknown>;
      } = { schema: {}, relations: {} };

      for (const model of models) {
        if (model.schema) {
          rs.schema[model.tableName] = model.schema;
        }

        if (model.relations) {
          rs.relations[`${model.tableName}Relations`] = model.relations;
        }
      }

      return rs;
    }

    hasModels(opts: { dataSource: string | TClass<IDataSource> }): boolean {
      const dsKey = typeof opts.dataSource === 'string' ? opts.dataSource : opts.dataSource.name;
      const modelNames = this.datasourceModels.get(dsKey);
      return modelNames !== undefined && modelNames.size > 0;
    }
  };
};

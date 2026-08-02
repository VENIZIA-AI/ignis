import type { IDataSource } from '@/base/datasources';
import type { AbstractEntity } from '@/base/models';
import type { TTableSchemaWithId } from '@/connectors/relational/models/common';
import type { TRelationConfig } from '@/connectors/relational/repositories/common';
import { createRelations } from '@/connectors/relational/repositories/dialect/relation';
import type { AnyType, TClass, TMixinTarget } from '@venizia/ignis-helpers';
import { resolveValue } from '@venizia/ignis-helpers';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../common/keys';
import type {
  IModelMetadata,
  IModelRegistryEntry,
  IRepositoryBinding,
  IRepositoryMetadata,
  IResolvedRepositoryMetadata,
} from '../common/types';

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

    /** The model CLASSES a datasource owns - never their names: two classes may share a name and the name-keyed `modelRegistry` holds only one, so keying by name resolves the WRONG class. */
    datasourceModels: Map<string, Set<TClass<AnyType>>>;

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
      // Every member of the binding may be a resolver (the escape hatch for circular imports); reading `.name` off the resolver would key the registry by the ARROW's inferred name and the datasource would silently discover no schema.
      const repositoryClass = resolveValue(opts.repository);
      this.repositoryBindings.set(repositoryClass.name, opts);

      const dataSourceRef = resolveValue(opts.dataSource);
      const dsKey = typeof dataSourceRef === 'string' ? dataSourceRef : dataSourceRef.name;

      const modelClass = resolveValue(opts.model);

      if (!this.datasourceModels.has(dsKey)) {
        this.datasourceModels.set(dsKey, new Set());
      }

      this.datasourceModels.get(dsKey)!.add(modelClass);
    }

    getRepositoryBinding(opts: { name: string }): IRepositoryBinding<AbstractEntity> | undefined {
      return this.repositoryBindings.get(opts.name);
    }

    /** Resolves and caches relations for a model entry - called lazily from buildSchema() so every @model class is registered first, avoiding circular-dependency ordering issues. @internal */
    resolveModelRelations(modelMeta: IModelRegistryEntry): unknown {
      if (modelMeta._builtRelations !== undefined) {
        return modelMeta._builtRelations;
      }

      if (!modelMeta.relationsResolver) {
        return undefined;
      }

      const relations = resolveValue(modelMeta.relationsResolver) as Array<TRelationConfig>;

      if (relations && modelMeta.schema) {
        // Registry stores schema as unknown (engine-neutral); this resolver only runs for drizzle-backed models, so the narrow is safe.
        const builtRelations = createRelations({
          source: modelMeta.schema as TTableSchemaWithId,
          relations,
        });

        modelMeta._builtRelations = builtRelations?.relations;
        return modelMeta._builtRelations;
      }

      return undefined;
    }

    /** Models registered for a datasource, relations resolved lazily. `schema`/`relations` stay `unknown` - the registry is shared across connectors, so each connector narrows at its call site. */
    getModels(opts: { dataSource: string | TClass<IDataSource> }): Array<{
      tableName: string;
      schema: unknown;
      relations?: unknown;
    }> {
      const { dataSource } = opts;
      const dsKey = typeof dataSource === 'string' ? dataSource : dataSource.name;
      const modelClasses = this.datasourceModels.get(dsKey) ?? new Set();

      const rs = Array.from(modelClasses)
        .map(modelClass => {
          // Read straight off the CLASS: a class -> name -> modelRegistry round-trip collapses two same-named models onto one entry, silently swapping schemas. `modelRegistry` stays name-keyed for the by-name APIs that need it.
          const entry: IModelRegistryEntry = {
            target: modelClass as AnyType,
            metadata:
              this.getModelMetadata({ target: modelClass }) ?? ({ settings: {} } as AnyType),
            schema: (modelClass as AnyType).schema,
            relationsResolver: (modelClass as AnyType).relations,
          };

          if (entry.schema === undefined) {
            return null;
          }

          return {
            tableName: this.resolveModelKey({ modelClass }),
            schema: entry.schema,
            relations: this.resolveModelRelations(entry),
          };
        })
        .filter((item): item is NonNullable<typeof item> => {
          return item !== undefined && item !== null;
        });

      return rs;
    }

    /** Like getModels but returns only resolved model classes - used by BaseSearchDataSource, which has no pgTable to resolve. */
    getModelClasses(opts: { dataSource: string | TClass<IDataSource> }): Array<TClass<unknown>> {
      const { dataSource } = opts;
      const dsKey = typeof dataSource === 'string' ? dataSource : dataSource.name;

      // Straight from the stored class refs: a name round-trip through the shared modelRegistry would hand back whichever same-named class registered last.
      return Array.from(this.datasourceModels.get(dsKey) ?? new Set());
    }

    /** The key a model occupies in `modelRegistry` - its table name, or its class name when it has none. */
    resolveModelKey(opts: { modelClass: TClass<AnyType> }): string {
      const { modelClass } = opts;
      const modelMetadata = this.getModelMetadata({ target: modelClass });

      return (
        [modelMetadata?.tableName, (modelClass as AnyType).TABLE_NAME].find(Boolean) ??
        modelClass.name
      );
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

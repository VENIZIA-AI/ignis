import type { IDataSource } from '@/base/datasources';
import type { AbstractEntity } from '@/base/models';
import type { AnyType, TClass, TMixinTarget } from '@venizia/ignis-helpers/common';
import { resolveValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../common/keys';
import { RelationBuilderRegistry } from '../common/relation-builder';
import type {
  IModelMetadata,
  IModelRegistryEntry,
  IRepositoryBinding,
  IResolvedRepositoryMetadata,
  TRepositoryMetadata,
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
    /** By repository class name, for the by-name API. Two classes may share a name; `repositoryBindingsByClass` cannot confuse them. */
    repositoryBindings: Map<string, IRepositoryBinding<AbstractEntity>>;

    /** By repository class: a minified build renames classes, and two chunks may give two of them one name. */
    repositoryBindingsByClass: Map<Function, IRepositoryBinding<AbstractEntity>>;

    /**
     * The model classes each datasource owns, keyed by the datasource class - or by the string a
     * repository named it with (`dataSource: 'PgDataSource'`), which only a class of that name
     * can match. Never by class name alone: a minified build gives two datasources one name.
     */
    datasourceModels: Map<string | Function, Set<TClass<AnyType>>>;

    setRepositoryMetadata<
      Target extends object = object,
      Model extends AbstractEntity = AbstractEntity,
      DataSource extends IDataSource = IDataSource,
    >(opts: {
      target: Target;
      metadata: TRepositoryMetadata<Model, DataSource> & {
        _resolved?: IResolvedRepositoryMetadata<Model, DataSource>;
      };
    }): void {
      const { target, metadata } = opts;
      Reflect.defineMetadata(MetadataKeys.REPOSITORY, metadata, target);
    }

    getRepositoryMetadata<Target extends object = object>(opts: {
      target: Target;
    }): (TRepositoryMetadata & { _resolved?: IResolvedRepositoryMetadata }) | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.REPOSITORY, target);
    }

    /** Registers a repository binding (called by @repository) linking a repository to its model + datasource. */
    registerRepositoryBinding<
      Model extends AbstractEntity = AbstractEntity,
      DataSource extends IDataSource = IDataSource,
    >(opts: IRepositoryBinding<Model, DataSource>) {
      // Every member of the binding may be a resolver, the escape hatch for circular imports.
      // Reading `.name` off the resolver keys the registry by the arrow's inferred name, and the
      // datasource then silently discovers no schema.
      const repositoryClass = resolveValue({ value: opts.repository });
      this.repositoryBindings.set(repositoryClass.name, opts);
      this.repositoryBindingsByClass.set(repositoryClass, opts);

      const dataSourceRef = resolveValue({ value: opts.dataSource });
      const modelClass = resolveValue({ value: opts.model });

      if (!this.datasourceModels.has(dataSourceRef)) {
        this.datasourceModels.set(dataSourceRef, new Set());
      }

      this.datasourceModels.get(dataSourceRef)!.add(modelClass);
    }

    /** By class, walking up to the nearest decorated parent; by name only for callers holding a name. */
    getRepositoryBinding(
      opts: { target: Function } | { name: string },
    ): IRepositoryBinding<AbstractEntity> | undefined {
      if ('name' in opts) {
        return this.repositoryBindings.get(opts.name);
      }

      for (
        let current: Function | null = opts.target;
        current && current !== Function.prototype;
        current = Object.getPrototypeOf(current)
      ) {
        const binding = this.repositoryBindingsByClass.get(current);
        if (binding) {
          return binding;
        }
      }

      return undefined;
    }

    /** A class finds what was registered under it, and under a string equal to its name. */
    getDataSourceModelClasses(opts: {
      dataSource: string | TClass<IDataSource>;
    }): Set<TClass<AnyType>> {
      const { dataSource } = opts;

      if (typeof dataSource === 'string') {
        return this.datasourceModels.get(dataSource) ?? new Set();
      }

      return new Set([
        ...(this.datasourceModels.get(dataSource) ?? []),
        ...(this.datasourceModels.get(dataSource.name) ?? []),
      ]);
    }

    /**
     * Resolves and caches relations for a model entry - called lazily from buildSchema() so that
     * every `@model` class is registered first, which avoids circular-dependency ordering issues.
     * @internal
     */
    resolveModelRelations(modelMeta: IModelRegistryEntry): unknown {
      if (modelMeta._builtRelations !== undefined) {
        return modelMeta._builtRelations;
      }

      if (!modelMeta.relationsResolver) {
        return undefined;
      }

      const relations = resolveValue({ value: modelMeta.relationsResolver });

      if (!relations || !modelMeta.schema) {
        return undefined;
      }

      const builder = RelationBuilderRegistry.resolve();

      // Relations were declared but no connector installed a builder - silently dropping them
      // would surface much later as an empty `with` clause.
      if (!builder) {
        throw getError({
          message: `[RepositoryMetadataMixin][resolveModelRelations] Model declares relations but no relation builder is registered | Import the relational connector so it installs one`,
        });
      }

      const builtRelations = builder({ source: modelMeta.schema, relations });

      modelMeta._builtRelations = builtRelations?.relations;
      return modelMeta._builtRelations;
    }

    /**
     * Models registered for a datasource, relations resolved lazily. `schema`/`relations` stay
     * `unknown` - the registry is shared across connectors, so each connector narrows at its call
     * site.
     */
    getModels(opts: { dataSource: string | TClass<IDataSource> }): Array<{
      tableName: string;
      schema: unknown;
      relations?: unknown;
    }> {
      const modelClasses = this.getDataSourceModelClasses({ dataSource: opts.dataSource });

      const rs = Array.from(modelClasses)
        .map(modelClass => {
          // Read straight off the class: a class -> name -> modelRegistry round-trip collapses two
          // same-named models onto one entry, silently swapping schemas. `modelRegistry` stays
          // name-keyed for the by-name APIs that need it.
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

    /**
     * Like getModels but returns only resolved model classes - used by BaseSearchDataSource, which
     * has no pgTable to resolve.
     */
    getModelClasses(opts: { dataSource: string | TClass<IDataSource> }): Array<TClass<unknown>> {
      // Straight from the stored class refs: a name round-trip through the shared modelRegistry
      // would hand back whichever same-named class registered last.
      return Array.from(this.getDataSourceModelClasses({ dataSource: opts.dataSource }));
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
      return this.getDataSourceModelClasses({ dataSource: opts.dataSource }).size > 0;
    }
  };
};

import { IDataSource } from '@/base';
import { BaseEntity, TTableSchemaWithId } from '@/base/models';
import { resolveValue, TClass, TMixinTarget } from '@venizia/ignis-helpers';
import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { relations as defineRelations } from 'drizzle-orm';
import { MetadataKeys } from '../common/keys';
import {
  IModelRegistryEntry,
  IRepositoryBinding,
  IRepositoryMetadata,
  IResolvedRepositoryMetadata,
  TDrizzleRelations,
} from '../common/types';

// -----------------------------------------------------------------
// Repository Metadata & Bindings
// -----------------------------------------------------------------
export const RepositoryMetadataMixin = <
  BaseClass extends TMixinTarget<
    _MetadataRegistry & { modelRegistry: Map<string, IModelRegistryEntry> }
  >,
>(
  baseClass: BaseClass,
  // mixinOpts: { },
) => {
  return class extends baseClass {
    // Repository bindings: repository class name -> model + datasource binding
    repositoryBindings: Map<string, IRepositoryBinding>;

    // DataSource -> Models mapping: datasource name -> set of model table names
    datasourceModels: Map<string, Set<string>>;

    setRepositoryMetadata<Target extends object = object>(opts: {
      target: Target;
      metadata: IRepositoryMetadata;
    }): void {
      const { target, metadata } = opts;
      Reflect.defineMetadata(MetadataKeys.REPOSITORY, metadata, target);
    }

    getRepositoryMetadata<Target extends object = object>(opts: {
      target: Target;
    }): (IRepositoryMetadata & { _resolved?: IResolvedRepositoryMetadata }) | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.REPOSITORY, target);
    }

    /**
     * Register a repository binding that connects a repository to a model and datasource.
     * This is called by the @repository decorator.
     *
     * Accepts either strongly typed classes or decorator targets.
     */
    registerRepositoryBinding<
      Schema extends TTableSchemaWithId = TTableSchemaWithId,
      Model extends BaseEntity<Schema> = BaseEntity<Schema>,
      DataSource extends IDataSource = IDataSource,
    >(opts: IRepositoryBinding<Schema, Model, DataSource>) {
      // Store the binding - cast to IRepositoryBinding which has compatible structure
      this.repositoryBindings.set(opts.repository.name, opts);

      // Track which datasource owns which models
      const dsKey = typeof opts.dataSource === 'string' ? opts.dataSource : opts.dataSource.name;

      // Cast model to access static properties
      const modelClass = resolveValue(opts.model);
      const tableName = modelClass.TABLE_NAME || modelClass.name;

      if (!this.datasourceModels.has(dsKey)) {
        this.datasourceModels.set(dsKey, new Set());
      }

      this.datasourceModels.get(dsKey)!.add(tableName);
    }

    /**
     * Get repository binding by repository class name
     */
    getRepositoryBinding(opts: { name: string }): IRepositoryBinding | undefined {
      return this.repositoryBindings.get(opts.name);
    }

    /**
     * Get all models registered for a specific datasource
     */
    getModels<Schema extends TTableSchemaWithId = TTableSchemaWithId>(opts: {
      dataSource: string | TClass<IDataSource>;
    }): Array<{
      tableName: string;
      schema: Schema;
      relations?: ReturnType<typeof defineRelations>;
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

          return {
            tableName,
            schema: modelMeta.schema as Schema,
            relations: modelMeta.relations,
          };
        })
        .filter((item): item is NonNullable<typeof item> => {
          return item !== undefined && item !== null;
        });

      return rs;
    }

    /**
     * Build auto-discovery schema for a datasource.
     * Assembles all table schemas and relations from registered models.
     *
     * Returns an object with:
     * - schema: Record of table schemas keyed by table name
     * - relations: Record of Drizzle relations keyed by `${tableName}Relations`
     */
    buildSchema(opts: { dataSource: string | TClass<IDataSource> }): {
      schema: Record<string, TTableSchemaWithId>;
      relations: Record<string, TDrizzleRelations>;
    } {
      const { dataSource } = opts;
      const models = this.getModels({ dataSource });

      const rs: {
        schema: Record<string, TTableSchemaWithId>;
        relations: Record<string, TDrizzleRelations>;
      } = { schema: {}, relations: {} };

      for (const model of models) {
        // Add table schema
        if (model.schema) {
          rs.schema[model.tableName] = model.schema;
        }

        // Add relations if defined
        if (model.relations) {
          rs.relations[`${model.tableName}Relations`] = model.relations;
        }
      }

      return rs;
    }

    /**
     * Check if a datasource has any models registered
     */
    hasModels(opts: { dataSource: string | TClass<IDataSource> }): boolean {
      const dsKey = typeof opts.dataSource === 'string' ? opts.dataSource : opts.dataSource.name;
      const modelNames = this.datasourceModels.get(dsKey);
      return modelNames !== undefined && modelNames.size > 0;
    }
  };
};

import { BaseEntity, TTableSchemaWithId } from '@/base/models';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../common/keys';
import {
  IModelMetadata,
  IModelRegistryEntry,
  TDecoratorModelTarget,
  TModelClass,
} from '../common/types';

// -----------------------------------------------------------------
// Model Metadata & Registry
// -----------------------------------------------------------------
export const ModelMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
  // mixinOpts: { },
) => {
  return class extends baseClass {
    modelRegistry: Map<string, IModelRegistryEntry>;

    setModelMetadata<Target extends object = object>(opts: {
      target: Target;
      metadata: IModelMetadata;
    }): void {
      const { target, metadata } = opts;
      Reflect.defineMetadata(MetadataKeys.MODEL, metadata, target);
    }

    getModelMetadata<Target extends object = object>(opts: {
      target: Target;
    }): IModelMetadata | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.MODEL, target);
    }

    /**
     * Register a model with its schema and relations in the model registry.
     * This is called by the @model decorator.
     *
     * IMPORTANT: Relations are stored as a resolver function (not resolved immediately)
     * to avoid circular dependency issues. When Model A references Model B and vice versa,
     * one would be undefined at decorator execution time. By storing the resolver function
     * and only executing it when DataSource.buildSchema() is called, we ensure all models
     * are loaded before relations are resolved.
     *
     * Accepts either:
     * - A strongly typed model class (TClass<Model> & IEntity<Schema>)
     * - A decorator target which will be treated as a model class
     */
    registerModel<
      Schema extends TTableSchemaWithId = TTableSchemaWithId,
      Model extends BaseEntity<Schema> = BaseEntity<Schema>,
    >(opts: { target: TDecoratorModelTarget<Schema, Model>; metadata: IModelMetadata }) {
      const { target, metadata } = opts;

      // Cast to access static properties - at runtime this is always a class constructor
      const modelClass = target as TModelClass<Schema, Model>;

      // Determine table name: metadata.tableName > static TABLE_NAME > class name
      const tableName = metadata.tableName || modelClass.TABLE_NAME || modelClass.name;

      // Store relations resolver function (NOT resolved value) to avoid circular dependencies
      // The resolver will be executed lazily in buildSchema() when all models are loaded
      const relationsResolver = modelClass.relations;

      // Store in model registry
      this.modelRegistry.set(tableName, {
        target: modelClass,
        metadata,
        schema: modelClass.schema,
        relationsResolver, // Store the resolver function, not the resolved value
      });

      // Set via Reflect for backward compatibility
      this.setModelMetadata({ target, metadata });
    }

    /**
     * Get a model entry from the registry by table name
     */
    getModelEntry(opts: { name: string }): IModelRegistryEntry | undefined {
      return this.modelRegistry.get(opts.name);
    }

    /**
     * Get all registered models
     */
    getAllModels(): Map<string, IModelRegistryEntry> {
      return this.modelRegistry;
    }
  };
};

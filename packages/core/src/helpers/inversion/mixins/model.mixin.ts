import type { AbstractEntity } from '@/base/models';
import type { TMixinTarget } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../common/keys';
import type {
  IModelAuthorizeSettings,
  IModelMetadata,
  IModelRegistryEntry,
  TDecoratorModelTarget,
  TModelClass,
} from '../common/types';

// Model Metadata & Registry
export const ModelMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
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
     * Registers a model (called by @model). Relations are stored as a resolver, not resolved
     * immediately, so circular references between models are resolved lazily in buildSchema().
     */
    registerModel<Model extends AbstractEntity = AbstractEntity>(opts: {
      target: TDecoratorModelTarget<Model>;
      metadata: IModelMetadata;
    }) {
      const { target, metadata } = opts;

      // Decorator target is always a class constructor at runtime
      const modelClass = target as TModelClass<Model>;

      // Table name precedence: explicit metadata > static TABLE_NAME > class name. TABLE_NAME is
      // kept out of IEntityStatics deliberately (not part of the neutral contract) but still
      // honored here via a local cast - real consumers set it in hundreds of places.
      const tableName =
        metadata.tableName || (modelClass as { TABLE_NAME?: string }).TABLE_NAME || modelClass.name;

      // Resolver, not resolved value — executed lazily in buildSchema() once all models are loaded
      const relationsResolver = modelClass.relations;

      this.modelRegistry.set(tableName, {
        target: modelClass,
        metadata,
        schema: modelClass.schema,
        relationsResolver,
      });

      // Also mirrored via Reflect so plain metadata lookups (getModelMetadata) still see it
      this.setModelMetadata({ target, metadata });
    }

    getModelEntry(opts: { name: string }): IModelRegistryEntry | undefined {
      return this.modelRegistry.get(opts.name);
    }

    getAllModels(): Map<string, IModelRegistryEntry> {
      return this.modelRegistry;
    }

    getModelAuthorizeSettings(opts: { name: string }): IModelAuthorizeSettings | undefined {
      const entry = this.getModelEntry(opts);
      return entry?.metadata?.settings?.authorize;
    }

    /** Authorization principals across all models that declare an authorize setting. */
    getAuthorizeModelPrincipals(opts: { format: 'array' }): string[];
    getAuthorizeModelPrincipals(opts: { format: 'record' }): Record<string, string>;
    getAuthorizeModelPrincipals(opts: { format: 'array' | 'record' }) {
      switch (opts.format) {
        case 'array': {
          const principals: string[] = [];

          for (const [, entry] of this.modelRegistry) {
            const principal = entry.metadata.settings?.authorize?.principal;
            if (principal) {
              principals.push(principal);
            }
          }

          return principals;
        }
        case 'record': {
          const record: Record<string, string> = {};

          for (const [name, entry] of this.modelRegistry) {
            const principal = entry.metadata.settings?.authorize?.principal;
            if (principal) {
              record[name] = principal;
            }
          }

          return record;
        }
        default: {
          throw getError({
            message: `[getAuthorizeModelPrincipals] Invalid format | format: ${opts.format} | valid: array, record`,
          });
        }
      }
    }

    getAuthorizeModelSettings(opts: { format: 'array' }): Array<{
      name: string;
      authorize: IModelAuthorizeSettings;
      entry: IModelRegistryEntry;
    }>;
    getAuthorizeModelSettings(opts: {
      format: 'record';
    }): Record<string, { authorize: IModelAuthorizeSettings; entry: IModelRegistryEntry }>;
    getAuthorizeModelSettings(opts: { format: 'array' | 'record' }) {
      switch (opts.format) {
        case 'array': {
          const result: Array<{
            name: string;
            authorize: IModelAuthorizeSettings;
            entry: IModelRegistryEntry;
          }> = [];

          for (const [name, entry] of this.modelRegistry) {
            const authorize = entry.metadata.settings?.authorize;
            if (authorize) {
              result.push({ name, authorize, entry });
            }
          }

          return result;
        }
        case 'record': {
          const record: Record<
            string,
            { authorize: IModelAuthorizeSettings; entry: IModelRegistryEntry }
          > = {};

          for (const [name, entry] of this.modelRegistry) {
            const authorize = entry.metadata.settings?.authorize;
            if (authorize) {
              record[name] = { authorize, entry };
            }
          }

          return record;
        }
        default: {
          throw getError({
            message: `[getAuthorizeModelSettings] Invalid format | format: ${opts.format} | valid: array, record`,
          });
        }
      }
    }
  };
};

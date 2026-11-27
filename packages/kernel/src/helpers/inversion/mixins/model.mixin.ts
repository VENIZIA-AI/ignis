import 'reflect-metadata';

import type { AbstractEntity } from '@/base/models';
import type { TMixinTarget } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { AuthorizeModelFormats, type TAuthorizeModelFormat } from '../common/constants';
import { MetadataKeys } from '../common/keys';
import type {
  IModelAuthorizeSettings,
  IModelMetadata,
  IModelRegistryEntry,
  TDecoratorModelTarget,
  TModelClass,
} from '../common/types';
import { StaticTableName } from './static-table-name';

/** Registered models that declare an authorize setting, in registry order. */
const collectAuthorizeEntries = (opts: {
  modelRegistry: Map<string, IModelRegistryEntry>;
}): Array<{ name: string; authorize: IModelAuthorizeSettings; entry: IModelRegistryEntry }> => {
  const result: Array<{
    name: string;
    authorize: IModelAuthorizeSettings;
    entry: IModelRegistryEntry;
  }> = [];

  for (const [name, entry] of opts.modelRegistry) {
    const authorize = entry.metadata.settings?.authorize;

    if (!authorize) {
      continue;
    }

    result.push({ name, authorize, entry });
  }

  return result;
};

/** Registered models that declare an authorize principal, in registry order. */
const collectAuthorizePrincipals = (opts: {
  modelRegistry: Map<string, IModelRegistryEntry>;
}): Array<{ name: string; principal: string }> => {
  const result: Array<{ name: string; principal: string }> = [];

  for (const [name, entry] of opts.modelRegistry) {
    const principal = entry.metadata.settings?.authorize?.principal;

    if (!principal) {
      continue;
    }

    result.push({ name, principal });
  }

  return result;
};

export const ModelMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    modelRegistry: Map<string, IModelRegistryEntry>;
    modelsBySchema: WeakMap<object, IModelRegistryEntry>;
    /** Schemas two model classes have claimed: no model answers for them, and a later class cannot take the claim back. */
    ambiguousSchemas: WeakSet<object>;

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

    /** Registers a model (called by @model) - relations are stored as a resolver, not resolved immediately, so circular references between models resolve lazily in buildSchema(). */
    registerModel<Model extends AbstractEntity = AbstractEntity>(opts: {
      target: TDecoratorModelTarget<Model>;
      metadata: IModelMetadata;
    }) {
      const { target, metadata } = opts;

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a decorator target is the model class itself; the decorator types it wider
      const modelClass = target as TModelClass<Model>;

      // Table name precedence: explicit metadata > static TABLE_NAME > class name.
      const staticName = StaticTableName.read({ modelClass });
      const tableName = [metadata.tableName, staticName].find(Boolean) ?? modelClass.name;

      // Resolver, not resolved value - executed lazily in buildSchema() once all models are loaded
      const relationsResolver = modelClass.relations;

      // Another class already holds this table name: the registry keeps only the last one, so it is marked, and a boot check
      // can refuse an `access` that a lookup by table could not tell from its twin.
      const previous = this.modelRegistry.get(tableName);
      const isShared = previous !== undefined && previous.target !== modelClass;
      const hasAccess = (item: { metadata?: IModelMetadata } | undefined) =>
        item?.metadata?.settings?.access !== undefined;
      // One of the classes on the table has an `access`: a lookup of the table that picks another one leaves its rows unscoped.
      const sharesAccess =
        isShared &&
        (hasAccess(previous) || previous?.sharesAccess === true || hasAccess({ metadata }));
      const entry: IModelRegistryEntry = {
        target: modelClass,
        metadata,
        schema: modelClass.schema,
        relationsResolver,
        ...(isShared ? { isShared: true as const } : {}),
        ...(sharesAccess ? { sharesAccess: true as const } : {}),
      };
      this.modelRegistry.set(tableName, entry);

      const { schema } = modelClass;

      if (schema && typeof schema === 'object') {
        const claimed = this.modelsBySchema.get(schema);

        if ((claimed && claimed.target !== modelClass) || this.ambiguousSchemas.has(schema)) {
          // Two classes on one schema: neither is the model of it, and a third must not become it.
          this.modelsBySchema.delete(schema);
          this.ambiguousSchemas.add(schema);
        } else {
          this.modelsBySchema.set(schema, entry);
        }
      }

      // Also mirrored via Reflect so plain metadata lookups (getModelMetadata) still see it
      this.setModelMetadata({ target, metadata });
    }

    getModelEntry(opts: { name: string }): IModelRegistryEntry | undefined {
      return this.modelRegistry.get(opts.name);
    }

    getModelEntryBySchema(opts: { schema: object }): IModelRegistryEntry | undefined {
      return this.modelsBySchema.get(opts.schema);
    }

    getAllModels(): Map<string, IModelRegistryEntry> {
      return this.modelRegistry;
    }

    getModelAuthorizeSettings(opts: { name: string }): IModelAuthorizeSettings | undefined {
      const entry = this.getModelEntry(opts);

      return entry?.metadata?.settings?.authorize;
    }

    /** Authorization principals across all models that declare an authorize setting. */
    getAuthorizeModelPrincipals(opts: { format: typeof AuthorizeModelFormats.ARRAY }): string[];
    getAuthorizeModelPrincipals(opts: {
      format: typeof AuthorizeModelFormats.RECORD;
    }): Record<string, string>;
    getAuthorizeModelPrincipals(opts: { format: TAuthorizeModelFormat }) {
      switch (opts.format) {
        case AuthorizeModelFormats.ARRAY: {
          return collectAuthorizePrincipals({ modelRegistry: this.modelRegistry }).map(
            (item) => item.principal,
          );
        }
        case AuthorizeModelFormats.RECORD: {
          const record: Record<string, string> = {};

          const authorizePrincipals = collectAuthorizePrincipals({
            modelRegistry: this.modelRegistry,
          });

          for (const item of authorizePrincipals) {
            record[item.name] = item.principal;
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

    getAuthorizeModelSettings(opts: { format: typeof AuthorizeModelFormats.ARRAY }): Array<{
      name: string;
      authorize: IModelAuthorizeSettings;
      entry: IModelRegistryEntry;
    }>;
    getAuthorizeModelSettings(opts: {
      format: typeof AuthorizeModelFormats.RECORD;
    }): Record<string, { authorize: IModelAuthorizeSettings; entry: IModelRegistryEntry }>;
    getAuthorizeModelSettings(opts: { format: TAuthorizeModelFormat }) {
      switch (opts.format) {
        case AuthorizeModelFormats.ARRAY: {
          return collectAuthorizeEntries({ modelRegistry: this.modelRegistry });
        }
        case AuthorizeModelFormats.RECORD: {
          const record: Record<
            string,
            { authorize: IModelAuthorizeSettings; entry: IModelRegistryEntry }
          > = {};

          const authorizeEntries = collectAuthorizeEntries({ modelRegistry: this.modelRegistry });

          for (const item of authorizeEntries) {
            record[item.name] = { authorize: item.authorize, entry: item.entry };
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

import { MetadataRegistry } from '@/helpers/inversion';
import { throwNotSupported } from '@/utilities';
import type { AnyType, TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type {
  IDataSource,
  IDataSourceCapabilities,
  ITransaction,
  ITransactionOptions,
  TAnyDataSourceSchema,
} from './common';

/**
 * Brands the datasource root so `@repository` can recognise a subclass WITHOUT `instanceof`.
 *
 * Two copies of this package give two `AbstractDataSource` classes, and `instanceof` across them is
 * false - the same trap `isApplicationError` exists to avoid for `ApplicationError`. `Symbol.for` is
 * realm-keyed, so both copies produce this exact symbol, and a static is inherited by every
 * subclass however deep.
 */
export const DATA_SOURCE_BRAND = Symbol.for('@venizia/ignis-kernel:abstract-data-source');

/** True for `AbstractDataSource` itself and for any class extending it, across package copies. */
export const isDataSourceClass = (value: unknown): value is TClass<AnyType> => {
  return typeof value === 'function' && DATA_SOURCE_BRAND in value;
};

/** Engine-neutral datasource root - NO SQL members. Every connector family extends this. */
export abstract class AbstractDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
>
  extends BaseHelper
  implements IDataSource<Settings, Schema, ConfigurableOptions>
{
  /** Read by {@link isDataSourceClass}. Static, so every subclass inherits it. */
  static readonly [DATA_SOURCE_BRAND] = true;

  name: string;
  settings: Settings;
  schema: Schema;

  abstract configure(opts?: ConfigurableOptions): ValueOrPromise<void>;

  getSettings() {
    return this.settings;
  }

  getSchema(): Schema {
    if (!this.schema) {
      throw getError({
        message: `[${this.constructor.name}] Schema not initialized. Override getSchema() or provide schema in constructor.`,
      });
    }
    return this.schema;
  }

  /** Capability probe, overridden by connectors that support it (e.g. postgres reports `{ transactions: true }`). */
  getCapabilities(): IDataSourceCapabilities {
    return { transactions: false };
  }

  /** Defaults to throwing NotSupported - only connectors with real transaction support override this; async so callers get a rejected promise, not a synchronous throw that skips try/catch. */
  async beginTransaction(_opts?: ITransactionOptions): Promise<ITransaction> {
    return throwNotSupported({
      scope: this.constructor.name,
      feature: 'Transactions',
      logger: this.logger,
    });
  }

  /** Model classes bound to this datasource via `@repository` metadata - paradigm-free (no schema/relation resolution). */
  protected getBoundModelClasses(): Array<TClass<unknown>> {
    return MetadataRegistry.getInstance().getModelClasses({
      dataSource: this.constructor as TClass<IDataSource>,
    });
  }

  /** Walks model classes bound to this datasource, reads a connector-specific artifact via `read`, and returns a name-keyed registry - skips undefined reads, throws on duplicate names, honors `autoDiscovery: false`. */
  protected discoverDefinitions<TDefinition extends { name: string }>(opts: {
    read: (modelClass: TClass<unknown>) => TDefinition | undefined;
    kind: string;
  }): Record<string, TDefinition> {
    const { read, kind } = opts;
    const logger = this.logger.for(this.discoverDefinitions.name);
    const registry = MetadataRegistry.getInstance();

    const metadata = registry.getDataSourceMetadata({ target: this.constructor });
    if (metadata?.autoDiscovery === false) {
      logger.debug('Auto-discovery disabled for %s', this.name);
      return {};
    }

    const modelClasses = this.getBoundModelClasses();

    const definitions: Record<string, TDefinition> = {};
    const definitionOwners = new Map<string, string>();

    for (const modelClass of modelClasses) {
      const definition = read(modelClass);

      if (!definition) {
        logger.warn(
          'Model has no %s definition | Skipping | Name: %s | Model: %s',
          kind,
          this.name,
          modelClass.name,
        );
        continue;
      }

      const existingOwner = definitionOwners.get(definition.name);
      if (existingOwner !== undefined && existingOwner !== modelClass.name) {
        throw getError({
          message: `[${this.constructor.name}][discoverDefinitions] Duplicate ${kind} name '${definition.name}' | Name: ${this.name} | Classes: ${existingOwner}, ${modelClass.name}`,
        });
      }

      definitionOwners.set(definition.name, modelClass.name);
      definitions[definition.name] = definition;
    }

    const names = Object.keys(definitions);
    logger.debug(
      'Detected %s(s) | Name: %s | Count: %s | Names: %j',
      kind,
      this.name,
      names.length,
      names,
    );

    return definitions;
  }
}

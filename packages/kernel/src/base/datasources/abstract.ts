import { MetadataRegistry } from '@/helpers/inversion';
import type { TClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { IDataSource, TAnyDataSourceSchema, TDataSourceOpenMode } from './common';
import { DataSourceOpenDefaults, DataSourceOpenModes } from './common';
import { DataSourceRoot } from './root';

/** Engine-neutral datasource root - NO SQL members. Every connector family extends this. */
export abstract class AbstractDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends DataSourceRoot<Settings, Schema, ConfigurableOptions> {
  /** The `open.on` of `@datasource`, `start` when unset. */
  override getOpenMode(): TDataSourceOpenMode {
    const metadata = MetadataRegistry.getInstance().getDataSourceMetadata({
      target: this.constructor,
    });

    return metadata?.open?.on ?? DataSourceOpenModes.START;
  }

  /** The `open.timeoutMs` of `@datasource` (ms; `0` waits for ever), 60 s when unset. */
  override getOpenTimeoutMs(): number {
    const metadata = MetadataRegistry.getInstance().getDataSourceMetadata({
      target: this.constructor,
    });

    return metadata?.open?.timeoutMs ?? DataSourceOpenDefaults.TIMEOUT_MS;
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

import { MetadataRegistry } from '@/helpers/inversion';
import { TClass } from '@venizia/ignis-helpers';
import { IDataSource } from '@/base/datasources';
import { ISearchCollectionDefinition, TSearchSchema } from '@/connectors/typesense/models';
import { ISearchDataSourceOptions } from '@/connectors/typesense/types';
import { AbstractSearchDataSource } from './abstract-datasource';

/**
 * `searchCollection` is the dual-schema escape hatch: a postgres entity carrying a search index
 * next to its pgTable `schema` declares it here instead of overloading `schema`'s type. Search-only
 * entities (`BaseSearchEntity`) carry their collection DSL directly as static `definition`.
 */
type TDiscoverableModelClass = TClass<unknown> & {
  searchCollection?: ISearchCollectionDefinition;
  schema?: unknown;
};

/** A pg entity's `schema` is a pgTable, not an `ISearchCollectionDefinition` - narrows by shape so
 * a pgTable is never mistaken for (and provisioned as) a search collection. */
const isSearchCollectionDefinition = (value: unknown): value is ISearchCollectionDefinition => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string' &&
    Array.isArray((value as { fields?: unknown }).fields)
  );
};

/** Collection discovery/provisioning over AbstractSearchDataSource's engine contract - mirrors BasePostgresDataSource's schema auto-discovery over AbstractPostgresDataSource. */
export abstract class BaseSearchDataSource<
  Settings extends object = {},
> extends AbstractSearchDataSource<Settings> {
  protected autoProvision: boolean;

  constructor(opts: ISearchDataSourceOptions<Settings>) {
    super({ scope: opts.name });

    this.name = opts.name;
    this.settings = opts.config;
    this.autoProvision = opts.autoProvision ?? true;
  }

  /** Auto-discovers collections from repositories if not manually provided. */
  override getSchema(): TSearchSchema {
    if (!this.schema) {
      this.schema = this.discoverCollections();
    }
    return this.schema;
  }

  hasDiscoverableModels(): boolean {
    const registry = MetadataRegistry.getInstance();
    return registry.hasModels({ dataSource: this.constructor as TClass<IDataSource> });
  }

  /**
   * Reads `static searchCollection` (dual-schema escape: a postgres entity carrying a search index
   * beside its pgTable), falling back to `static schema` (shape-guarded so a
   * pgTable's `schema` is never mistaken for a collection definition); skips classes with
   * neither. Honors `@datasource({ autoDiscovery: false })` same as the postgres branch.
   */
  protected discoverCollections(): TSearchSchema {
    return this.discoverDefinitions<ISearchCollectionDefinition>({
      kind: 'collection',
      read: modelClass => {
        const model = modelClass as TDiscoverableModelClass;

        if (model.searchCollection) {
          return model.searchCollection;
        }

        return isSearchCollectionDefinition(model.schema) ? model.schema : undefined;
      },
    });
  }

  /** Provisions discovered collections via ensureCollection (additive-only; destructive migration is caller policy). Skipped if autoProvision is false; failures propagate so boot fails loudly. */
  protected async provisionCollections(): Promise<void> {
    const logger = this.logger.for(this.provisionCollections.name);

    if (!this.autoProvision) {
      logger.info(
        'autoProvision disabled | Skipping collection provisioning | Name: %s',
        this.name,
      );
      return;
    }

    const definitions = Object.values(this.getSchema());

    for (const definition of definitions) {
      await this.ensureCollection({ definition });
    }

    logger.info('Provisioned collection(s) | Name: %s | Count: %s', this.name, definitions.length);
  }
}

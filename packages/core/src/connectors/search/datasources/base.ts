import type { IDataSource } from '@/base/datasources';
import type { ISearchCollectionDefinition, TSearchSchema } from '@/connectors/search/models';
import { toSearchQueryParams } from '@/connectors/search/repositories/common';
import type { ISearchDataSourceOptions } from '@/connectors/search/datasources/common';
import type { TMultiSearchEntry } from '@/connectors/search/repositories/common';
import { MetadataRegistry } from '@/helpers/inversion';
import type { TClass } from '@venizia/ignis-helpers';
import { AbstractSearchDataSource } from './abstract';

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

    const autoProvision = (process.env.APP_ENV_AUTO_PROVISION_COLLECTION ?? 'false').toLowerCase();
    this.autoProvision = opts.autoProvision ?? (autoProvision === 'true' || autoProvision === '1');
    this.logger.info(
      '[constructor] Auto Provision Collection - autoProvision: %s',
      this.autoProvision,
    );
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
   * Cross-collection search - lives on the datasource (not a single-collection repository) since it
   * spans many collections at once. The envelope is engine-specific, so the neutral return is
   * `unknown`; `TypesenseDataSource` narrows it to its results/union shapes.
   */
  multiSearch(opts: {
    searches: TMultiSearchEntry[];
    union?: boolean;
    commonParams?: Omit<TMultiSearchEntry, 'collection'>;
    options?: unknown;
  }): Promise<unknown> {
    const { searches, union: isUnion, commonParams, options } = opts;
    const dialect = this.getQueryDialect();

    // Friendly camelCase (query/queryBy: string[]/...) -> engine wire at the datasource boundary via
    // the same path single search() uses: friendly -> ISearchQuery -> dialect wire map.
    const wireSearches = searches.map(entry => ({
      collection: entry.collection,
      ...dialect.toWireParams({ query: toSearchQueryParams(entry) }),
    }));
    const wireCommonParams = commonParams
      ? dialect.toWireParams({ query: toSearchQueryParams(commonParams) })
      : undefined;

    return this.getConnector().multiSearch({
      searches: wireSearches,
      union: isUnion,
      commonParams: wireCommonParams,
      options,
    });
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

      if (!definition.synonyms?.length) {
        continue;
      }

      await this.provisionSynonyms({ definition });
    }

    logger.info('Provisioned collection(s) | Name: %s | Count: %s', this.name, definitions.length);
  }

  /** Engines expose synonyms as either named linkable sets or a flat per-collection dictionary, and
   * some expose neither - so both groups are optional on `ISearchConnector` and are branched on here. */
  protected async provisionSynonyms(opts: {
    definition: ISearchCollectionDefinition;
  }): Promise<void> {
    const { definition } = opts;
    const logger = this.logger.for(this.provisionSynonyms.name);
    const connector = this.getConnector();
    const items = definition.synonyms ?? [];

    if (connector.synonymSet) {
      // v30+: declared synonyms become one named set linked to the collection (the pre-v30
      // per-collection synonyms API was removed). Set name stays distinct from Typesense's own
      // auto-migration name (`<collection>_synonyms_index`) so the two never clash.
      const synonymSetName = `${definition.name}_synonyms`;

      await connector.synonymSet.upsert({ name: synonymSetName, items });
      await connector.synonymSet.link({
        collection: definition.name,
        synonymSets: [synonymSetName],
      });
      return;
    }

    if (connector.synonyms) {
      await connector.synonyms.set({ collection: definition.name, items });
      return;
    }

    logger.warn(
      'Collection declares synonyms but the engine exposes no synonym API | Name: %s | Collection: %s',
      this.name,
      definition.name,
    );
  }
}

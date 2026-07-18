import type { IDataSource } from '@/base/datasources';
import type { ISearchConnector } from '@/connectors/search/connector';
import type { ISearchCollectionDefinition, TSearchSchema } from '@/connectors/search/models';
import { toSearchQueryParams } from '@/connectors/search/repositories/common';
import type { ISearchDataSourceOptions } from '@/connectors/search/datasources/common';
import type { TMultiSearchEntry } from '@/connectors/search/repositories/common';
import { MetadataRegistry } from '@/helpers/inversion';
import { getError, type TClass } from '@venizia/ignis-helpers';
import { AbstractSearchDataSource } from './abstract';

/** `searchCollection` is the dual-schema escape hatch: a postgres entity with a search index declares
 * it here beside its pgTable `schema`; search-only entities carry the DSL as static `definition`. */
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

/** Collection discovery/provisioning + connector lifecycle over AbstractSearchDataSource - mirrors
 * BasePostgresDataSource. Paradigm seam: the connector is held via the `ISearchConnector`-bounded
 * generic, never an engine type - engines supply only `createConnector()`. */
export abstract class BaseSearchDataSource<
  Settings extends object = {},
  TConnector extends ISearchConnector = ISearchConnector,
> extends AbstractSearchDataSource<Settings> {
  protected autoProvision: boolean;
  protected hiddenFieldsByCollectionMap?: Record<string, string[]>;
  protected connector?: TConnector;

  private readonly injectedConnector?: TConnector;

  constructor(opts: ISearchDataSourceOptions<Settings> & { connector?: TConnector }) {
    super({ scope: opts.name });

    this.name = opts.name;
    this.settings = opts.config;
    this.injectedConnector = opts.connector;

    const autoProvision = (process.env.APP_ENV_AUTO_PROVISION_COLLECTION ?? 'false').toLowerCase();
    this.autoProvision = opts.autoProvision ?? (autoProvision === 'true' || autoProvision === '1');
    this.logger.info(
      '[constructor] Auto Provision Collection - autoProvision: %s',
      this.autoProvision,
    );
  }

  /** The engine's connector instance - the ONLY engine-specific step of the lifecycle. */
  protected abstract createConnector(): TConnector;

  /** Builds the connector (unless injected, e.g. for tests), then provisions collections. Re-entrant-safe: a second call is a logged no-op, not a re-provision. */
  async configure(): Promise<void> {
    if (this.connector) {
      this.logger
        .for(this.configure.name)
        .info('Already configured | Name: %s | Skipping re-provisioning', this.name);
      return;
    }

    this.connector = this.injectedConnector ?? this.createConnector();

    await this.provisionCollections();
  }

  getConnector(): TConnector {
    if (!this.connector) {
      throw getError({
        message: `[${this.constructor.name}] Connector not initialized | Name: ${this.name} | Call configure() first`,
      });
    }

    return this.connector;
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

  /** Cross-collection search, so it lives on the datasource, not a repository. Engine-specific
   * envelope: neutral return is `unknown`; `TypesenseDataSource` narrows it. */
  multiSearch(opts: {
    searches: TMultiSearchEntry[];
    union?: boolean;
    commonParams?: Omit<TMultiSearchEntry, 'collection'>;
    options?: unknown;
  }): Promise<unknown> {
    const { searches, union: isUnion, commonParams, options } = opts;
    const dialect = this.getQueryDialect();
    const hiddenByCollection = this.hiddenFieldsByCollection();

    // Same friendly -> wire mapping search() uses; unions each entry's hidden fields into
    // excludeFields per collection, exactly as search() does for @model hiddenProperties.
    const wireSearches = searches.map(entry => ({
      collection: entry.collection,
      ...dialect.toWireParams({
        query: toSearchQueryParams(this.applyHiddenExclusion({ entry, hiddenByCollection })),
      }),
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

  /** Reads `static searchCollection`, falling back to shape-guarded `static schema`; skips classes
   * with neither. Honors `@datasource({ autoDiscovery: false })` same as the postgres branch. */
  protected discoverCollections(): TSearchSchema {
    return this.discoverDefinitions<ISearchCollectionDefinition>({
      kind: 'collection',
      read: modelClass => this.readCollectionDefinition(modelClass),
    });
  }

  /** Reads a bound model class's collection definition (dual-schema `searchCollection` first, then the
   * shape-guarded `schema`); returns undefined for a class carrying neither. */
  private readCollectionDefinition(
    modelClass: TClass<unknown>,
  ): ISearchCollectionDefinition | undefined {
    const model = modelClass as TDiscoverableModelClass;

    if (model.searchCollection) {
      return model.searchCollection;
    }

    return isSearchCollectionDefinition(model.schema) ? model.schema : undefined;
  }

  /** Collection name -> `@model` hiddenProperties, for cross-collection operations (multiSearch).
   * Collections with none are omitted - callers own exclusion for absent entries. Memoized per
   * instance: `@model`/`@repository` metadata is frozen after boot, so never invalidated. */
  protected hiddenFieldsByCollection(): Record<string, string[]> {
    this.hiddenFieldsByCollectionMap ??= this.discoverHiddenFieldsByCollection();
    return this.hiddenFieldsByCollectionMap;
  }

  /** The registry/model walk behind `hiddenFieldsByCollection` - mirrors the
   * `getSchema()` / `discoverCollections()` split. */
  protected discoverHiddenFieldsByCollection(): Record<string, string[]> {
    const registry = MetadataRegistry.getInstance();
    const result: Record<string, string[]> = {};

    for (const modelClass of this.getBoundModelClasses()) {
      const definition = this.readCollectionDefinition(modelClass);
      if (!definition) {
        continue;
      }

      const hiddenProperties = registry.getModelMetadata({ target: modelClass })?.settings
        ?.hiddenProperties;
      if (hiddenProperties && hiddenProperties.length > 0) {
        result[definition.name] = hiddenProperties;
      }
    }

    return result;
  }

  /** Unions a collection's hidden fields into one multiSearch entry's excludeFields. An entry whose
   * collection is unknown (not a discovered definition) passes through untouched - the caller owns
   * exclusion there, exactly as the raw connector escape hatch does. */
  private applyHiddenExclusion(opts: {
    entry: TMultiSearchEntry;
    hiddenByCollection: Record<string, string[]>;
  }): TMultiSearchEntry {
    const { entry, hiddenByCollection } = opts;
    const hiddenFields = hiddenByCollection[entry.collection];

    if (!hiddenFields || hiddenFields.length === 0) {
      return entry;
    }

    const excludeFields = Array.from(new Set([...(entry.excludeFields ?? []), ...hiddenFields]));
    return { ...entry, excludeFields };
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
      // Set name stays distinct from Typesense's own auto-migration name
      // (`<collection>_synonyms_index`) so the two never clash.
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

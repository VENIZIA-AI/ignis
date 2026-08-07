import type { ITransaction } from '@/base/datasources';
import type { TFilter, TLockOptions, TWhere } from '@/base/repositories/common';
import { AbstractRepository } from '@/base/repositories/core';
import { DEFAULT_MAX_LIMIT } from '@/base/repositories/common';
import { SearchErrors } from '@/connectors/search/common';
import { getError } from '@venizia/ignis-helpers';
import type { AbstractSearchDataSource } from '@/connectors/search/datasources';
import type { BaseSearchEntity } from '@/connectors/search/models';
import { throwNotSupported } from '@/utilities';
import type { TClass } from '@venizia/ignis-helpers';
import type {
  ISearchQuery,
  ISearchQueryDialect,
  TCompiledWhere,
} from '@/connectors/search/repositories/common';
import { SearchFilterOutcomes } from '@/connectors/search/repositories/common';

/** Search-repository plumbing on `AbstractRepository`. `TDataSource` carries the concrete connector type through `this.connector`, so a concretely-bound repository reaches its engine's verbs uncast while an engine-agnostic one is forced to write `connector.alias?.…`. */
export abstract class SearchBaseRepository<
  TDocument extends object = object,
  TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource,
> extends AbstractRepository<TDocument, TDocument> {
  constructor(
    dataSource?: TDataSource,
    opts?: { scope?: string; entityClass?: TClass<BaseSearchEntity> },
  ) {
    super(dataSource, opts);
  }

  override get dataSource(): TDataSource {
    return super.dataSource as TDataSource;
  }

  override set dataSource(value: TDataSource) {
    super.dataSource = value;
  }

  override get entity(): BaseSearchEntity {
    return super.entity as BaseSearchEntity;
  }

  override set entity(value: BaseSearchEntity) {
    super.entity = value;
  }

  get collectionName(): string {
    return this.entity.name;
  }

  protected get connector(): ReturnType<TDataSource['getConnector']> {
    return this.dataSource.getConnector() as ReturnType<TDataSource['getConnector']>;
  }

  protected get queryDialect(): ISearchQueryDialect {
    return this.dataSource.getQueryDialect();
  }

  get multiSearch(): TDataSource['multiSearch'] {
    return this.dataSource.multiSearch.bind(this.dataSource);
  }

  override setDataSource(opts: { dataSource: TDataSource }): void {
    super.setDataSource(opts);
  }

  /** WRITE responses never pass through the engine's exclude-fields filter, so hiddenProperties are stripped here - the relational branch gets the same guarantee from `.returning(visibleProperties)`. */
  protected omitHiddenFields<R>(document: R): R {
    const hiddenFields = this.hiddenFields;

    if (hiddenFields.length === 0 || document === null || typeof document !== 'object') {
      return document;
    }

    const visible: Record<string, unknown> = { ...(document as Record<string, unknown>) };

    for (const field of hiddenFields) {
      delete visible[field];
    }

    return visible as R;
  }

  protected omitHiddenFieldsAll<R>(documents: R[]): R[] {
    if (this.hiddenFields.length === 0) {
      return documents;
    }

    return documents.map(document => this.omitHiddenFields(document));
  }

  /** No search engine here has a transaction primitive (this tier is engine-neutral - Typesense and Meilisearch both inherit it) - a caller-supplied options.transaction is rejected loudly instead of silently running outside the transaction the caller expects. */
  protected assertNoTransaction(opts?: { transaction?: ITransaction }): void {
    if (!opts?.transaction) {
      return;
    }

    throwNotSupported({
      scope: this.dataSource.constructor.name,
      feature: 'Transactions',
      logger: this.logger,
    });
  }

  /** Row-level locking (SELECT ... FOR UPDATE) has no search-engine equivalent - same NotSupported convention as assertNoTransaction. */
  protected assertNoLock(opts?: { lock?: TLockOptions }): void {
    if (!opts?.lock) {
      return;
    }

    throwNotSupported({
      scope: this.dataSource.constructor.name,
      feature: 'Row-level locking',
      logger: this.logger,
    });
  }

  private _collectionFields?: Set<string>;

  /**
   * Field names the collection declares, or undefined when it declares none - which means
   * "unvalidated", not "no fields": an entity carrying no `ISearchCollectionDefinition` must
   * compile exactly as it did before field checking existed.
   *
   * Read from the entity's own typed `schema` rather than by casting into `entity.constructor`;
   * `BaseSearchEntity.schema` is instance-side and already an `ISearchCollectionDefinition`.
   * Memoized per repository instance - the definition is frozen after boot.
   */
  protected get collectionFields(): ReadonlySet<string> | undefined {
    if (!this._collectionFields) {
      const fields = this.entity?.schema?.fields;
      this._collectionFields = new Set((fields ?? []).map(field => field.name));
    }

    return this._collectionFields.size > 0 ? this._collectionFields : undefined;
  }

  /**
   * Builds a dialect-translated query, always stripping hiddenFields.
   *
   * The caller's `where` and the repository-owned `defaultWhere` are compiled SEPARATELY and
   * combined after, rather than merged into one tree first. Merging first makes the two
   * indistinguishable, and the repository's own clause would then have to satisfy the
   * caller-facing field check: `SprocketDocument` in integration-wiring.test.ts declares
   * [title, secretCode] but carries `defaultFilter: { where: { isActive: true } }`, so every
   * request through it would 400 ITSELF. Compiling separately makes the trust boundary a matter
   * of WHICH CALL IS MADE, which - unlike a flag threaded through the recursion - cannot be wrong
   * at a nested level.
   */
  protected buildQuery(opts: {
    filter?: TFilter;
    shouldSkipDefaultFilter?: boolean;
  }): ISearchQuery {
    const { filter, shouldSkipDefaultFilter } = opts;
    const defaultWhere = shouldSkipDefaultFilter ? undefined : this.defaultWhere;

    this.assertLimitWithinCeiling({ limit: filter?.limit });

    // `where` is withheld from `build` and compiled below: handing it over merged would field-check
    // the repository's own clause along with the caller's.
    const query = this.queryDialect.build({
      filter: filter ? { ...filter, where: undefined } : undefined,
      hiddenFields: this.hiddenFields,
    });

    const compiled = this.compileEffectiveWhere({ where: filter?.where, defaultWhere });

    switch (compiled.outcome) {
      case SearchFilterOutcomes.FILTER: {
        query.filterBy = compiled.filterBy;
        break;
      }
      case SearchFilterOutcomes.MATCH_NONE: {
        query.matchNone = true;
        break;
      }
      case SearchFilterOutcomes.MATCH_ALL:
      default: {
        // Vacuously true - nothing to set and nothing to short-circuit. Spelled out rather than
        // left as an unwritten else, so all three outcomes are visibly accounted for.
        break;
      }
    }

    return query;
  }

  /**
   * Refuses a caller-supplied page larger than this model allows.
   *
   * POLICY, and the counterweight to a guardrail this tier removed: an engine used to refuse more
   * than 250 hits per page, so an unreasonable `limit` failed fast and cheap. Now that such a page
   * is served, something has to decide when it is unreasonable, and the framework would otherwise
   * be less safe than before it could satisfy the request.
   *
   * It lives in `buildQuery` because that is the one point BOTH `find()` and `search()` pass
   * through - enforcing in `find()` alone would leave `search()` as a way around it, which is not
   * a ceiling. `mode: 'raw'` bypasses `buildQuery` and therefore bypasses this deliberately: raw
   * is the documented escape hatch and its callers own the consequences. They still cannot exceed
   * the connector's physical ceiling, which is the intended layering - policy is opt-out-able,
   * physics is not.
   */
  protected assertLimitWithinCeiling(opts: { limit?: number }): void {
    const { limit } = opts;
    const ceiling = this.maxLimit ?? DEFAULT_MAX_LIMIT;

    if (limit === undefined || limit <= ceiling) {
      return;
    }

    throw getError({
      error: SearchErrors.PAGE_TOO_LARGE,
      message: `[${this.constructor.name}][buildQuery] Requested page exceeds this model's limit | collection: '${this.collectionName}' | requested: ${limit} | maximum: ${ceiling} | raise it with @model settings.maxLimit if larger pages are genuinely needed`,
    });
  }

  /**
   * Compiles the caller clause (field-checked) and the repository-owned default clause
   * (unchecked), then ANDs them via the dialect - `defaultWhere` first, preserving the order the
   * previous `{ and: [defaultWhere, where] }` merge produced.
   */
  protected compileEffectiveWhere(opts: { where?: TWhere; defaultWhere?: TWhere }): TCompiledWhere {
    const { where, defaultWhere } = opts;
    const dialect = this.queryDialect;
    const clauses: TCompiledWhere[] = [];

    if (defaultWhere) {
      clauses.push(dialect.compileWhere({ where: defaultWhere }));
    }

    if (where) {
      clauses.push(
        dialect.compileWhere({ where, capabilities: { fields: this.collectionFields } }),
      );
    }

    return dialect.conjoin({ clauses });
  }
}

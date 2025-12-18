import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, IEntity, TTableInsert, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { BaseHelper, getError, resolveValue, TClass, TNullable } from '@venizia/ignis-helpers';
import {
  DEFAULT_LIMIT,
  IPersistableRepository,
  RepositoryOperationScopes,
  TCount,
  TDrizzleQueryOptions,
  TFilter,
  TRelationConfig,
  TRepositoryLogOptions,
  TRepositoryOperationScope,
  TWhere,
} from '../common';
import { DrizzleFilterBuilder } from '../operators';

/**
 * Base repository class with dependency injection support.
 *
 * Supports injection patterns:
 *
 * 1. Zero boilerplate - dataSource auto-injected from @repository metadata:
 * ```typescript
 * @repository({ model: User, dataSource: PostgresDataSource })
 * export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
 *   // No constructor needed - datasource auto-injected!
 * }
 * ```
 *
 * 2. Explicit @inject:
 * ```typescript
 * @repository({ model: User })
 * export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
 *   constructor(
 *     @inject({ key: 'datasources.PostgresDataSource' })
 *     dataSource: PostgresDataSource,
 *   ) {
 *     super(dataSource);
 *   }
 * }
 * ```
 */
export abstract class AbstractRepository<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends Schema['$inferSelect'] = Schema['$inferSelect'],
  PersistObject extends TTableInsert<Schema> = TTableInsert<Schema>,
  ExtraOptions extends TNullable<object> = undefined,
>
  extends BaseHelper
  implements IPersistableRepository<Schema, DataObject, PersistObject, ExtraOptions>
{
  protected operationScope: TRepositoryOperationScope;
  protected filterBuilder: DrizzleFilterBuilder;

  // Lazy-resolved properties
  private _dataSource?: IDataSource;
  private _entity?: BaseEntity<Schema>;

  defaultLimit: number;

  /**
   * @param ds - DataSource (auto-injected from @repository decorator or passed explicitly)
   * @param opts - Optional configuration
   */
  constructor(
    ds?: IDataSource,
    opts?: {
      scope?: string;
      entityClass?: TClass<BaseEntity<Schema>>;
      operationScope?: TRepositoryOperationScope;
      defaultLimit?: number;
    },
  ) {
    const scopeName =
      (opts?.scope ?? opts?.entityClass?.name)
        ? [opts?.entityClass?.name, 'Repository'].join('')
        : new.target.name;

    super({ scope: scopeName });

    this.operationScope = opts?.operationScope ?? RepositoryOperationScopes.READ_ONLY;
    this.filterBuilder = new DrizzleFilterBuilder();
    this.defaultLimit = opts?.defaultLimit ?? DEFAULT_LIMIT;

    if (ds) {
      this._dataSource = ds;
    }

    if (opts?.entityClass) {
      this._entity = new opts.entityClass();
    }
  }

  /**
   * Get dataSource - must be injected via @repository decorator or constructor
   */
  get dataSource(): IDataSource {
    if (!this._dataSource) {
      throw getError({
        message: `[${this.constructor.name}] DataSource not available. Use @repository({ model: YourModel, dataSource: YourDataSource }) or pass dataSource in constructor.`,
      });
    }
    return this._dataSource;
  }

  set dataSource(value: IDataSource) {
    this._dataSource = value;
  }

  /**
   * Get entity - auto-resolves from @repository metadata if not explicitly set
   */
  get entity(): BaseEntity<Schema> {
    if (!this._entity) {
      this._entity = this.resolveEntity();
    }
    return this._entity;
  }

  set entity(value: BaseEntity<Schema>) {
    this._entity = value;
  }

  /**
   * Resolve entity from @repository metadata
   */
  protected resolveEntity(): BaseEntity<Schema> {
    const registry = MetadataRegistry.getInstance();
    const binding = registry.getRepositoryBinding({
      name: this.constructor.name,
    });

    if (!binding?.model) {
      throw getError({
        message: `[${this.constructor.name}] Cannot resolve entity. Either pass entityClass in constructor or use @repository decorator with model option.`,
      });
    }

    // Cast to TClass - at runtime this is always a class constructor
    const ctor = resolveValue(binding.model) as TClass<BaseEntity<Schema>>;
    return new ctor();
  }

  /**
   * Get relations from entity's static relations property.
   * Converts the array format to a record keyed by relation name.
   */
  protected getEntityRelations(): { [relationName: string]: TRelationConfig } {
    const entityClass = this.entity.constructor as TClass<BaseEntity<Schema>> & IEntity<Schema>;

    if (!entityClass.relations) {
      return {};
    }

    const relationsArray = resolveValue(entityClass.relations);
    const relationsRecord: { [relationName: string]: TRelationConfig } = {};

    for (const relation of relationsArray) {
      relationsRecord[relation.name] = relation;
    }

    return relationsRecord;
  }

  setDataSource(opts: { dataSource: IDataSource }): void {
    this._dataSource = opts.dataSource;
  }

  // ---------------------------------------------------------------------------
  get connector() {
    return this.dataSource.connector;
  }

  getEntity(): BaseEntity<Schema> {
    return this.entity;
  }

  getEntitySchema(): Schema {
    return this.entity.schema;
  }

  getConnector(): IDataSource['connector'] {
    return this.connector;
  }

  buildQuery(opts: { filter: TFilter<DataObject> }): TDrizzleQueryOptions {
    return this.filterBuilder.build({
      tableName: this.entity.name,
      schema: this.entity.schema,
      relations: this.getEntityRelations(),
      filter: opts.filter,
    });
  }

  // ---------------------------------------------------------------------------
  abstract count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;

  abstract existsWith(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<boolean>;

  abstract find(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<DataObject[]>;
  abstract findOne(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>>;

  abstract findById(opts: {
    id: IdType;
    filter?: TFilter<DataObject> | undefined;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>>;

  // ---------------------------------------------------------------------------
  abstract create(opts: {
    data: PersistObject;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  abstract create(opts: {
    data: PersistObject;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Schema['$inferSelect'] }>;

  abstract createAll(opts: {
    data: Array<PersistObject>;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  abstract createAll(opts: {
    data: Array<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Array<Schema['$inferSelect']> }>;

  // ---------------------------------------------------------------------------
  abstract updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  abstract updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Schema['$inferSelect'] }>;

  abstract updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: (ExtraOptions | {}) & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  abstract updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<Schema['$inferSelect']> }>;

  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: (ExtraOptions | {}) & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<Schema['$inferSelect']> }>;
  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<Schema['$inferSelect']>> }> {
    if (opts.options?.shouldReturn === false) {
      const strictOpts = opts as {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options: (ExtraOptions | {}) & {
          shouldReturn: false;
          force?: boolean;
          log?: TRepositoryLogOptions;
        };
      };
      return this.updateAll(strictOpts);
    }

    const strictOpts = opts as {
      data: Partial<PersistObject>;
      where: TWhere<DataObject>;
      options?: (ExtraOptions | {}) & {
        shouldReturn?: true;
        force?: boolean;
        log?: TRepositoryLogOptions;
      };
    };
    return this.updateAll(strictOpts);
  }

  // ---------------------------------------------------------------------------
  abstract deleteById(opts: {
    id: IdType;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  abstract deleteById(opts: {
    id: IdType;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Schema['$inferSelect'] }>;

  abstract deleteAll(opts: {
    where: TWhere<DataObject>;
    options: (ExtraOptions | {}) & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  abstract deleteAll(opts: {
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<Schema['$inferSelect']> }>;

  deleteBy(opts: {
    where: TWhere<DataObject>;
    options: (ExtraOptions | {}) & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  deleteBy(opts: {
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<Schema['$inferSelect']> }>;
  deleteBy(opts: {
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<Schema['$inferSelect']>> }> {
    if (opts.options?.shouldReturn === false) {
      const strictOpts = opts as {
        where: TWhere<DataObject>;
        options: (ExtraOptions | {}) & {
          shouldReturn: false;
          force?: boolean;
          log?: TRepositoryLogOptions;
        };
      };
      return this.deleteAll(strictOpts);
    }

    const strictOpts = opts as {
      where: TWhere<DataObject>;
      options?: (ExtraOptions | {}) & {
        shouldReturn?: true;
        force?: boolean;
        log?: TRepositoryLogOptions;
      };
    };
    return this.deleteAll(strictOpts);
  }
}

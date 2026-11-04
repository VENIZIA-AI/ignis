import type { TIdSchemaType } from '@venizia/ignis-kernel';

/** Options of `SqliteDataTypeEnricher`: per-column defaults for the generic typed-value columns. A default is applied when its key is present, so `0`, `''` and `false` count. */
export type TDataTypeEnricherOptions = {
  defaultValue: Partial<{
    dataType: string;
    nValue: number;
    tValue: string;
    bValue: Buffer;
    jValue: object;
    boValue: boolean;
  }>;
};

/**
 * SQLite has no sequences or identity columns - an integer primary key is the table's rowid, which
 * the engine assigns. `autoIncrement` maps to `AUTOINCREMENT`, which additionally forbids reusing a
 * deleted row's id, matching Postgres `generatedAlwaysAsIdentity`.
 */
export type TIdEnricherOptions = {
  /** @default { dataType: 'number' } */
  id?:
    | {
        dataType: 'string';
        /**
         * Builds each new id.
         *
         * @default a UUID v7
         */
        generator?: () => string;
      }
    | {
        dataType: 'number';
        /** @default true */
        autoIncrement?: boolean;
      };
};

/** Options of `SqlitePrincipalEnricher`: the discriminator name, the id column type, and whether the id and the type column are nullable. */
export type TPrincipalEnricherOptions<
  Discriminator extends string = string,
  PolymorphicIdType extends TIdSchemaType = TIdSchemaType,
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
> = {
  /** @default 'principal' */
  discriminator?: Discriminator;
  defaultPolymorphic?: string;
  polymorphicIdType: PolymorphicIdType;
  /** @default false */
  isNullableId?: Nullable;
  /**
   * `true` leaves the `{discriminator}Type` column nullable with a `''` default. `false`
   * makes it `NOT NULL` with no default, so an insert must give the type; a `defaultPolymorphic`
   * keeps that default.
   *
   * @default true
   */
  isNullableDiscriminator?: NullableDiscriminator;
};

/**
 * No `withTimezone` twin of the Postgres options: with no `timestamptz`, every timestamp is an ISO
 * 8601 UTC string carrying its own offset. Omitting `enable` opts the column IN - only
 * `enable: false` drops it.
 */
export type TTzEnricherOptions = {
  /** @default { columnName: 'created_at' } */
  created?: { columnName: string };
  /** @default { enable: true, columnName: 'modified_at' } */
  modified?: { enable: false } | { enable?: true; columnName: string };
  /** @default { enable: false } */
  deleted?: { enable: false } | { enable?: true; columnName: string };
};

/** One audit column of `SqliteUserAuditEnricher`: its id type (`number` or `string`), its column name, and whether a missing user is allowed (`allowAnonymous`). */
export type TUserAuditColumnOpts = {
  dataType: TIdSchemaType;
  columnName: string;
  /** @default true */
  allowAnonymous?: boolean;
};

/** Options of `SqliteUserAuditEnricher`: the `created` and `modified` user columns. */
export type TUserAuditEnricherOptions = {
  /** @default { dataType: 'number', columnName: 'created_by', allowAnonymous: true } */
  created?: TUserAuditColumnOpts;
  /** @default { dataType: 'number', columnName: 'modified_by', allowAnonymous: true } */
  modified?: TUserAuditColumnOpts;
};

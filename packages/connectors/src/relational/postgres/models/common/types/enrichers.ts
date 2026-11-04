import type { TIdSchemaType } from '@venizia/ignis-kernel';
import type { PgSequenceOptions } from 'drizzle-orm/pg-core';
import type { TBigIntMode } from '../constants';

/** Options of `PostgresDataTypeEnricher`: per-column defaults for the generic typed-value columns. A default is applied when its key is present, so `0`, `''` and `false` count. */
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

/** Options for the `id` primary-key column: `string` (generated text id), `number` (identity) or `big-number` (identity, `numberMode` picks the JS type). */
export type TIdEnricherOptions = {
  /** @default { dataType: 'number' } */
  id?: { columnName?: string } & (
    | { dataType: 'string'; generator?: () => string }
    | {
        dataType: 'number';
        sequenceOptions?: PgSequenceOptions;
      }
    | {
        dataType: 'big-number';
        numberMode: TBigIntMode;
        sequenceOptions?: PgSequenceOptions;
      }
  );
};

/** Options of `PostgresPrincipalEnricher`: the discriminator name, the id column type `polymorphicIdType` (required), and whether the id and the type column are nullable. */
export type TPrincipalEnricherOptions<
  Discriminator extends string = string,
  PolymorphicIdType extends TIdSchemaType = TIdSchemaType,
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
> = {
  /**
   * The prefix of the `{discriminator}Type` and `{discriminator}Id` columns.
   *
   * @default 'principal'
   */
  discriminator?: Discriminator;
  defaultPolymorphic?: string;
  polymorphicIdType: PolymorphicIdType;
  /**
   * Whether the `{discriminator}Id` column allows NULL.
   *
   * @default false
   */
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

/** Options for the timestamp columns. `created` is always present. */
export type TTzEnricherOptions = {
  /** @default { columnName: 'created_at', withTimezone: true } */
  created?: { columnName: string; withTimezone: boolean };
  /** @default { enable: true, columnName: 'modified_at', withTimezone: true } */
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  /** @default { enable: false } */
  deleted?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
};

/** One audit column of `PostgresUserAuditEnricher`: its id type (`number` or `string`), its column name, and whether a missing user is allowed. */
export type TUserAuditColumnOpts = {
  dataType: TIdSchemaType;
  columnName: string;
  /** @default true */
  allowAnonymous?: boolean;
};

/** Options of `PostgresUserAuditEnricher`: the `created` and `modified` user columns. */
export type TUserAuditEnricherOptions = {
  /** @default { dataType: 'number', columnName: 'created_by', allowAnonymous: true } */
  created?: TUserAuditColumnOpts;
  /** @default { dataType: 'number', columnName: 'modified_by', allowAnonymous: true } */
  modified?: TUserAuditColumnOpts;
};

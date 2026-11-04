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

/** Options for the `id` primary-key column: `string` (generated text id), `number` (identity) or `big-number` (identity, `numberMode` picks the JS type). Omitted means a number identity. */
export type TIdEnricherOptions = {
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

/** Options of `PostgresPrincipalEnricher`: the discriminator name (default `principal`), the id column type `polymorphicIdType` (required), and whether the id and the type column are nullable. */
export type TPrincipalEnricherOptions<
  Discriminator extends string = string,
  PolymorphicIdType extends TIdSchemaType = TIdSchemaType,
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
> = {
  discriminator?: Discriminator;
  defaultPolymorphic?: string;
  polymorphicIdType: PolymorphicIdType;
  isNullableId?: Nullable;
  /**
   * `true` (default) leaves the `{discriminator}Type` column nullable with a `''` default. `false`
   * makes it `NOT NULL` with no default, so an insert must give the type; a `defaultPolymorphic`
   * keeps that default.
   */
  isNullableDiscriminator?: NullableDiscriminator;
};

/** Options for the timestamp columns. `modified` is on and `deleted` is off unless configured; `created` is always present. */
export type TTzEnricherOptions = {
  created?: { columnName: string; withTimezone: boolean };
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  deleted?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
};

/** One audit column of `PostgresUserAuditEnricher`: its id type (`number` or `string`), its column name, and whether a missing user is allowed (`allowAnonymous`, true when omitted). */
export type TUserAuditColumnOpts = {
  dataType: TIdSchemaType;
  columnName: string;
  allowAnonymous?: boolean;
};

/** Options of `PostgresUserAuditEnricher`: the `created` and `modified` user columns; an omitted one defaults to a nullable `number` column (`created_by`, `modified_by`). */
export type TUserAuditEnricherOptions = {
  created?: TUserAuditColumnOpts;
  modified?: TUserAuditColumnOpts;
};

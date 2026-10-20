import type { PgSequenceOptions } from 'drizzle-orm/pg-core';

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

export type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string'; generator?: () => string }
    | {
        dataType: 'number';
        sequenceOptions?: PgSequenceOptions;
      }
    | {
        dataType: 'big-number';
        numberMode: 'number' | 'bigint';
        sequenceOptions?: PgSequenceOptions;
      }
  );
};

export type TPrincipalEnricherOptions<
  Discriminator extends string = string,
  PolymorphicIdType extends 'number' | 'string' = 'number' | 'string',
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

export type TTzEnricherOptions = {
  created?: { columnName: string; withTimezone: boolean };
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  deleted?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
};

export type TUserAuditColumnOpts = {
  dataType: 'string' | 'number';
  columnName: string;
  allowAnonymous?: boolean;
};

export type TUserAuditEnricherOptions = {
  created?: TUserAuditColumnOpts;
  modified?: TUserAuditColumnOpts;
};

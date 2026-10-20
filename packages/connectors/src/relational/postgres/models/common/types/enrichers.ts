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
> = {
  discriminator?: Discriminator;
  defaultPolymorphic?: string;
  polymorphicIdType: PolymorphicIdType;
  isNullableId?: Nullable;
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

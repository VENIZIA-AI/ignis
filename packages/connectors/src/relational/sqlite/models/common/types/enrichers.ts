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
  id?:
    | { dataType: 'string'; generator?: () => string }
    | { dataType: 'number'; autoIncrement?: boolean };
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

/**
 * No `withTimezone` twin of the Postgres options: with no `timestamptz`, every timestamp is an ISO
 * 8601 UTC string carrying its own offset. Omitting `enable` opts the column IN - only
 * `enable: false` drops it. Omitting the key keeps the default: `modified` on, `deleted` off.
 */
export type TTzEnricherOptions = {
  created?: { columnName: string };
  modified?: { enable: false } | { enable?: true; columnName: string };
  deleted?: { enable: false } | { enable?: true; columnName: string };
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

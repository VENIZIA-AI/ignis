import { CoreErrorCodes } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { HasDefault, NotNull } from 'drizzle-orm';
import type {
  SQLiteIntegerBuilderInitial,
  SQLiteTextBuilderInitial,
} from 'drizzle-orm/sqlite-core';
import { integer, text } from 'drizzle-orm/sqlite-core';
import type { TColumnDefinitions, TPrincipalEnricherOptions } from '../common/types';

type TSQLiteTextColumn = SQLiteTextBuilderInitial<string, [string, ...string[]], undefined>;

// A widened `boolean` flag takes the NOT NULL branch: the insert type then requires the value, which
// is safe whichever way the flag resolves at runtime. With `isNullableDiscriminator: false` the type
// column is required in the insert type even when a `defaultPolymorphic` gives it a runtime default.
type TPrincipalColumnDef<
  Discriminator extends string,
  IdType extends 'number' | 'string',
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
> = (IdType extends 'number'
  ? {
      [K in `${Discriminator}Id`]: [Nullable] extends [true]
        ? SQLiteIntegerBuilderInitial<string>
        : NotNull<SQLiteIntegerBuilderInitial<string>>;
    }
  : {
      [K in `${Discriminator}Id`]: [Nullable] extends [true]
        ? TSQLiteTextColumn
        : NotNull<TSQLiteTextColumn>;
    }) & {
  [K in `${Discriminator}Type`]: [NullableDiscriminator] extends [true]
    ? HasDefault<TSQLiteTextColumn>
    : NotNull<TSQLiteTextColumn>;
};

export const generatePrincipalColumnDefs = <
  Discriminator extends string = 'principal',
  IdType extends 'number' | 'string' = 'number',
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
>(
  opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>,
): TPrincipalColumnDef<Discriminator, IdType, Nullable, NullableDiscriminator> => {
  const {
    discriminator = 'principal',
    defaultPolymorphic,
    polymorphicIdType,
    isNullableId = false,
    isNullableDiscriminator = true,
  } = opts;

  const typeField = `${discriminator}Type`;
  const idField = `${discriminator}Id`;
  const idColumnName = `${discriminator}_id`;

  // `false` is the only value that makes the type column required: it drops the '' default unless
  // the caller named one, so an insert without the type fails instead of storing ''.
  const typeColumn = text(`${discriminator}_type`);
  const typeDef =
    isNullableDiscriminator === false
      ? defaultPolymorphic === undefined
        ? typeColumn.notNull()
        : typeColumn.default(defaultPolymorphic).notNull()
      : typeColumn.default(defaultPolymorphic ?? '');

  switch (polymorphicIdType) {
    case 'number': {
      return {
        [typeField]: typeDef,
        [idField]: isNullableId ? integer(idColumnName) : integer(idColumnName).notNull(),
      } as TPrincipalColumnDef<Discriminator, IdType, Nullable, NullableDiscriminator>;
    }
    case 'string': {
      return {
        [typeField]: typeDef,
        [idField]: isNullableId ? text(idColumnName) : text(idColumnName).notNull(),
      } as TPrincipalColumnDef<Discriminator, IdType, Nullable, NullableDiscriminator>;
    }
    default: {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
        messageCode: CoreErrorCodes.NOT_SUPPORTED,
        message: `[generatePrincipalColumnDefs] Invalid polymorphicIdType | value: ${polymorphicIdType} | valid: ['number', 'string']`,
      });
    }
  }
};

export const enrichPrincipal = <
  ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions,
  Discriminator extends string = string,
  IdType extends 'number' | 'string' = 'number' | 'string',
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
>(
  baseSchema: ColumnDefinitions,
  opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>,
) => {
  const defs = generatePrincipalColumnDefs(opts);

  return { ...baseSchema, ...defs };
};

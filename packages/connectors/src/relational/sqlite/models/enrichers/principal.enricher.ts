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

type TPrincipalColumnDef<
  Discriminator extends string,
  IdType extends 'number' | 'string',
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
> = (IdType extends 'number'
  ? {
      [K in `${Discriminator}Id`]: Nullable extends true
        ? SQLiteIntegerBuilderInitial<string>
        : NotNull<SQLiteIntegerBuilderInitial<string>>;
    }
  : {
      [K in `${Discriminator}Id`]: Nullable extends true
        ? TSQLiteTextColumn
        : NotNull<TSQLiteTextColumn>;
    }) & {
  [K in `${Discriminator}Type`]: NullableDiscriminator extends true
    ? HasDefault<TSQLiteTextColumn>
    : NotNull<HasDefault<TSQLiteTextColumn>>;
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
    defaultPolymorphic = '',
    polymorphicIdType,
    isNullableId = false,
    isNullableDiscriminator = true,
  } = opts;

  const polymorphic = {
    typeField: `${discriminator}Type`,
    typeColumnName: `${discriminator}_type`,
    idField: `${discriminator}Id`,
    idType: polymorphicIdType,
    idColumnName: `${discriminator}_id`,
    isNullableId,
    isNullableDiscriminator,
  };

  const typeColumn = text(polymorphic.typeColumnName).default(defaultPolymorphic);
  const typeDef = polymorphic.isNullableDiscriminator ? typeColumn : typeColumn.notNull();

  switch (polymorphic.idType) {
    case 'number': {
      return {
        [polymorphic.typeField]: typeDef,
        [polymorphic.idField]: polymorphic.isNullableId
          ? integer(polymorphic.idColumnName)
          : integer(polymorphic.idColumnName).notNull(),
      } as TPrincipalColumnDef<Discriminator, IdType, Nullable, NullableDiscriminator>;
    }
    case 'string': {
      return {
        [polymorphic.typeField]: typeDef,
        [polymorphic.idField]: polymorphic.isNullableId
          ? text(polymorphic.idColumnName)
          : text(polymorphic.idColumnName).notNull(),
      } as TPrincipalColumnDef<Discriminator, IdType, Nullable, NullableDiscriminator>;
    }
    default: {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
        messageCode: CoreErrorCodes.NOT_SUPPORTED,
        message: `[generatePrincipalColumnDefs] Invalid polymorphicIdType | value: ${polymorphic.idType} | valid: ['number', 'string']`,
      });
    }
  }
};

export const enrichPrincipal = <ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts: TPrincipalEnricherOptions,
) => {
  const defs = generatePrincipalColumnDefs(opts);

  return { ...baseSchema, ...defs };
};

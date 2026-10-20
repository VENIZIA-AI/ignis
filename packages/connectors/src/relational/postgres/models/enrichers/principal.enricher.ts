import { getError } from '@venizia/ignis-helpers/core';
import type { PgIntegerBuilderInitial, PgTextBuilderInitial } from 'drizzle-orm/pg-core';
import { integer, text } from 'drizzle-orm/pg-core';
import type { TColumnDefinitions, TPrincipalEnricherOptions } from '../common/types';
import type { HasDefault, NotNull } from 'drizzle-orm';

type TPrincipalColumnDef<
  Discriminator extends string,
  IdType extends 'number' | 'string',
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
> = (IdType extends 'number'
  ? {
      [K in `${Discriminator}Id`]: Nullable extends true
        ? PgIntegerBuilderInitial<string>
        : NotNull<PgIntegerBuilderInitial<string>>;
    }
  : {
      [K in `${Discriminator}Id`]: Nullable extends true
        ? PgTextBuilderInitial<string, [string, ...string[]]>
        : NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
    }) & {
  [K in `${Discriminator}Type`]: NullableDiscriminator extends true
    ? HasDefault<PgTextBuilderInitial<string, [string, ...string[]]>>
    : NotNull<HasDefault<PgTextBuilderInitial<string, [string, ...string[]]>>>;
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

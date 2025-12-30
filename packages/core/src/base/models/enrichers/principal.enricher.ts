import {
  integer,
  PgIntegerBuilderInitial,
  PgTextBuilderInitial,
  PgUUIDBuilderInitial,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { TColumnDefinitions } from '../common/types';
import { HasDefault, NotNull } from 'drizzle-orm';

export type TPrincipalEnricherOptions<
  Discriminator extends string = string,
  IdType extends 'number' | 'string' | 'uuid' = 'number' | 'string' | 'uuid',
> = {
  discriminator?: Discriminator;
  defaultPolymorphic?: string;
  polymorphicIdType: IdType;
};

type TPrincipalColumnDef<
  Discriminator extends string,
  IdType extends 'number' | 'string' | 'uuid',
> = (IdType extends 'number'
  ? {
      [K in `${Discriminator}Id`]: NotNull<PgIntegerBuilderInitial<string>>;
    }
  : IdType extends 'uuid'
    ? {
        [K in `${Discriminator}Id`]: NotNull<PgUUIDBuilderInitial<string>>;
      }
    : {
        [K in `${Discriminator}Id`]: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
      }) & {
  [K in `${Discriminator}Type`]: HasDefault<PgTextBuilderInitial<string, [string, ...string[]]>>;
};

export const generatePrincipalColumnDefs = <
  Discriminator extends string = 'principal',
  IdType extends 'number' | 'string' | 'uuid' = 'number',
>(
  opts: TPrincipalEnricherOptions<Discriminator, IdType>,
): TPrincipalColumnDef<Discriminator, IdType> => {
  const { discriminator = 'principal', defaultPolymorphic = '', polymorphicIdType } = opts;

  const polymorphic = {
    typeField: `${discriminator}Type`,
    typeColumnName: `${discriminator}_type`,
    idField: `${discriminator}Id`,
    idType: polymorphicIdType,
    idColumnName: `${discriminator}_id`,
  };

  switch (polymorphic.idType) {
    case 'number': {
      return {
        [polymorphic.typeField]: text(polymorphic.typeColumnName).default(defaultPolymorphic),
        [polymorphic.idField]: integer(polymorphic.idColumnName).notNull(),
      } as TPrincipalColumnDef<Discriminator, IdType>;
    }
    case 'string': {
      return {
        [polymorphic.typeField]: text(polymorphic.typeColumnName).default(defaultPolymorphic),
        [polymorphic.idField]: text(polymorphic.idColumnName).notNull(),
      } as TPrincipalColumnDef<Discriminator, IdType>;
    }
    case 'uuid': {
      return {
        [polymorphic.typeField]: text(polymorphic.typeColumnName).default(defaultPolymorphic),
        [polymorphic.idField]: uuid(polymorphic.idColumnName).notNull(),
      } as TPrincipalColumnDef<Discriminator, IdType>;
    }
    default: {
      throw new Error(
        `[generatePrincipalColumnDefs] Invalid polymorphicIdType | value: ${polymorphic.idType} | valid: ['number', 'string', 'uuid]`,
      );
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

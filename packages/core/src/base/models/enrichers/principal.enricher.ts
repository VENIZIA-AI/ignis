import { integer, PgIntegerBuilderInitial, PgTextBuilderInitial, text } from 'drizzle-orm/pg-core';
import { TColumnDefinitions } from '../common/types';
import { HasDefault, NotNull } from 'drizzle-orm';

export type TPrincipalEnricherOptions = {
  discriminator?: string;
  defaultPolymorphic?: string;
  polymorphicIdType: 'number' | 'string';
};

type TPrincipalColumnDef<Opts extends TPrincipalEnricherOptions> = Opts extends {
  discriminator: infer Discriminator extends string;
}
  ? Opts extends { polymorphicIdType: infer IdType }
    ? IdType extends 'number'
      ? {
          [K in `${Discriminator}Type`]: HasDefault<
            PgTextBuilderInitial<string, [string, ...string[]]>
          >;
        } & {
          [K in `${Discriminator}Id`]: NotNull<PgIntegerBuilderInitial<`${Discriminator}_id`>>;
        }
      : {
          [K in `${Discriminator}Type`]: HasDefault<
            PgTextBuilderInitial<string, [string, ...string[]]>
          >;
        } & {
          [K in `${Discriminator}Id`]: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
        }
    : never
  : Opts extends { polymorphicIdType: infer IdType }
    ? IdType extends 'number'
      ? {
          principalType: HasDefault<PgTextBuilderInitial<string, [string, ...string[]]>>;
          principalId: NotNull<PgIntegerBuilderInitial<string>>;
        }
      : {
          principalType: HasDefault<PgTextBuilderInitial<string, [string, ...string[]]>>;
          principalId: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
        }
    : never;

export const generatePrincipalColumnDefs = <Opts extends TPrincipalEnricherOptions>(
  opts: Opts,
): TPrincipalColumnDef<Opts> => {
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
      } as TPrincipalColumnDef<Opts>;
    }
    case 'string': {
      return {
        [polymorphic.typeField]: text(polymorphic.typeColumnName).default(defaultPolymorphic),
        [polymorphic.idField]: text(polymorphic.idColumnName).notNull(),
      } as TPrincipalColumnDef<Opts>;
    }
    default: {
      throw new Error(
        `[generatePrincipalColumnDefs] Invalid polymorphicIdType | value: ${polymorphic.idType} | valid: ['number', 'string']`,
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

import type { TIdSchemaType } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import type { PgIntegerBuilderInitial, PgTextBuilderInitial } from 'drizzle-orm/pg-core';
import { integer, text } from 'drizzle-orm/pg-core';
import type { TColumnDefinitions, TPrincipalEnricherOptions } from '../common/types';
import type { HasDefault, NotNull } from 'drizzle-orm';

// A widened `boolean` flag takes the NOT NULL branch: the insert type then requires the value, which
// is safe whichever way the flag resolves at runtime. With `isNullableDiscriminator: false` the type
// column is required in the insert type even when a `defaultPolymorphic` gives it a runtime default.
type TPrincipalColumnDef<
  Discriminator extends string,
  IdType extends TIdSchemaType,
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
> = (IdType extends 'number'
  ? {
      [K in `${Discriminator}Id`]: [Nullable] extends [true]
        ? PgIntegerBuilderInitial<string>
        : NotNull<PgIntegerBuilderInitial<string>>;
    }
  : {
      [K in `${Discriminator}Id`]: [Nullable] extends [true]
        ? PgTextBuilderInitial<string, [string, ...string[]]>
        : NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
    }) & {
  [K in `${Discriminator}Type`]: [NullableDiscriminator] extends [true]
    ? HasDefault<PgTextBuilderInitial<string, [string, ...string[]]>>
    : NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
};

export class PostgresPrincipalEnricher {
  static generateColumnDefs<
    Discriminator extends string = 'principal',
    IdType extends TIdSchemaType = 'number',
    Nullable extends boolean = false,
    NullableDiscriminator extends boolean = true,
  >(
    opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>,
  ): TPrincipalColumnDef<Discriminator, IdType, Nullable, NullableDiscriminator> {
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
          message: `[generatePrincipalColumnDefs] Invalid polymorphicIdType | value: ${polymorphicIdType} | valid: ['number', 'string']`,
        });
      }
    }
  }

  static enrich<
    ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions,
    Discriminator extends string = string,
    IdType extends TIdSchemaType = TIdSchemaType,
    Nullable extends boolean = false,
    NullableDiscriminator extends boolean = true,
  >(opts: {
    baseSchema: ColumnDefinitions;
    opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>;
  }) {
    const { baseSchema, opts: enricherOpts } = opts;
    const defs = PostgresPrincipalEnricher.generateColumnDefs(enricherOpts);
    return { ...baseSchema, ...defs };
  }
}

/** @deprecated Use PostgresPrincipalEnricher.generateColumnDefs(opts). Removed in 0.5. */
export const generatePrincipalColumnDefs = <
  Discriminator extends string = 'principal',
  IdType extends TIdSchemaType = 'number',
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
>(
  opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>,
): TPrincipalColumnDef<Discriminator, IdType, Nullable, NullableDiscriminator> =>
  PostgresPrincipalEnricher.generateColumnDefs(opts);

/** @deprecated Use PostgresPrincipalEnricher.enrich({ baseSchema, opts }). Removed in 0.5. */
export const enrichPrincipal = <
  ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions,
  Discriminator extends string = string,
  IdType extends TIdSchemaType = TIdSchemaType,
  Nullable extends boolean = false,
  NullableDiscriminator extends boolean = true,
>(
  baseSchema: ColumnDefinitions,
  opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>,
) => PostgresPrincipalEnricher.enrich({ baseSchema, opts });

import { integer, text } from 'drizzle-orm/pg-core';
import { TColumnDefinitions } from '../types';

export type TPrincipalEnricherOptions = {
  discriminator?: string;
  defaultPolymorphic?: string;
  polymorphicIdType: 'number' | 'string';
};

export const generatePrincipalColumnDefs = (opts: TPrincipalEnricherOptions) => {
  const { discriminator = 'principal', defaultPolymorphic = '', polymorphicIdType } = opts;

  const polymorphic = {
    typeField: `${discriminator}Type`,
    typeColumnName: `${discriminator}_type`,
    idField: `${discriminator}Id`,
    idType: polymorphicIdType,
    idColumnName: `${discriminator}_id`,
  };

  return {
    [polymorphic.typeField]: text(polymorphic.typeColumnName).default(defaultPolymorphic),
    [polymorphic.idField]: (polymorphic.idType === 'number'
      ? integer(polymorphic.idField)
      : text(polymorphic.idField)
    ).notNull(),
  };
};

export const enrichPrincipal = <ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts: TPrincipalEnricherOptions,
) => {
  const defs = generatePrincipalColumnDefs(opts);
  return Object.assign({}, baseSchema, defs);
};

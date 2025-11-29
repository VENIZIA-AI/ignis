import { integer, text } from 'drizzle-orm/pg-core';
import { TColumns } from '../types';

export type TPrincipalEnricherOptions = {
  discriminator?: string;
  defaultPolymorphic?: string;
  polymorphicIdType: 'number' | 'string';
};

export const enrichPrincipal = <ColumnDefinitions extends TColumns = TColumns>(
  baseSchema: ColumnDefinitions,
  opts: TPrincipalEnricherOptions,
) => {
  const { discriminator = 'principal', defaultPolymorphic = '', polymorphicIdType } = opts;

  const polymorphic = {
    typeField: `${discriminator}Type`,
    typeColumnName: `${discriminator}_type`,
    idField: `${discriminator}Id`,
    idType: polymorphicIdType,
    idColumnName: `${discriminator}_id`,
  };

  const rs = Object.assign({}, baseSchema, {
    [polymorphic.typeField]: text(polymorphic.typeColumnName).default(defaultPolymorphic),
    [polymorphic.idField]: (polymorphic.idType === 'number'
      ? integer(polymorphic.idField)
      : text(polymorphic.idField)
    ).notNull(),
  });

  return rs;
};

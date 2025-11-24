import { integer, text } from 'drizzle-orm/pg-core';
import { TColumns } from '../types';

export const enrichPrincipal = (
  baseSchema: TColumns,
  opts: {
    discriminator?: string;
    defaultPolymorphic?: string;
    polymorphicIdType: 'number' | 'string';
  },
): TColumns => {
  const { discriminator = 'principal', defaultPolymorphic = '', polymorphicIdType } = opts;

  const polymorphic = {
    typeField: `${discriminator}Type`,
    typeColumnName: `${discriminator}_type`,
    idField: `${discriminator}Id`,
    idType: polymorphicIdType,
    idColumnName: `${discriminator}_id`,
  };

  return Object.assign({}, baseSchema, {
    [polymorphic.typeField]: text(polymorphic.typeColumnName).default(defaultPolymorphic),
    [polymorphic.idField]: (polymorphic.idType === 'number'
      ? integer(polymorphic.idField)
      : text(polymorphic.idField)
    ).notNull(),
  });
};

import { boolean, customType, integer, jsonb, text } from 'drizzle-orm/pg-core';
import { TColumnDefinitions } from '../types';

const byteaType = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const generateDataTypeColumnDefs = (_opts?: {}) => {
  return {
    dataType: text('data_type'),
    nValue: integer('n_value'),
    tValue: text('t_value'),
    bValue: byteaType('b_value'),
    jValue: jsonb('j_value'),
    boValue: boolean('bo_value'),
  };
};

export const enrichDataTypes = (baseSchema: TColumnDefinitions, opts?: {}) => {
  const defs = generateDataTypeColumnDefs(opts);
  return Object.assign({}, baseSchema, defs);
};

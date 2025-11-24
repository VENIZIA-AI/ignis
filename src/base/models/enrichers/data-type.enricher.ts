import { boolean, customType, integer, jsonb, text } from 'drizzle-orm/pg-core';
import { TColumns } from '../types';

export const enrichDataTypes = (baseSchema: TColumns, _opts?: {}): TColumns => {
  const byteaType = customType<{ data: Buffer }>({
    dataType() {
      return 'bytea';
    },
  });

  return Object.assign({}, baseSchema, {
    dataType: text('data_type'),
    nValue: integer('n_value'),
    tValue: text('t_value'),
    bValue: byteaType('b_value'),
    jValue: jsonb('j_value'),
    boValue: boolean('bo_value'),
  });
};

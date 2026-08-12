import type { AnyType } from '@venizia/ignis-helpers/common';
import { boolean, customType, doublePrecision, jsonb, text } from 'drizzle-orm/pg-core';
import type { TColumnDefinitions, TDataTypeEnricherOptions } from '../common/types';

const byteaType = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const generateDataTypeColumnDefs = (opts?: TDataTypeEnricherOptions) => {
  const { defaultValue } = opts ?? {};

  // Gate on presence, not truthiness - `0`, `''` and `false` are legitimate defaults.
  return {
    dataType:
      defaultValue?.dataType !== undefined
        ? text('data_type').default(defaultValue.dataType)
        : text('data_type'),
    nValue:
      defaultValue?.nValue !== undefined
        ? doublePrecision('n_value').default(defaultValue.nValue)
        : doublePrecision('n_value'),
    tValue:
      defaultValue?.tValue !== undefined
        ? text('t_value').default(defaultValue.tValue)
        : text('t_value'),
    bValue:
      defaultValue?.bValue !== undefined
        ? byteaType('b_value').default(defaultValue.bValue)
        : byteaType('b_value'),
    jValue:
      defaultValue?.jValue !== undefined
        ? jsonb('j_value').default(defaultValue.jValue).$type<Record<string, AnyType>>()
        : jsonb('j_value').$type<Record<string, AnyType>>(),
    boValue:
      defaultValue?.boValue !== undefined
        ? boolean('bo_value').default(defaultValue.boValue)
        : boolean('bo_value'),
  };
};

export const enrichDataTypes = (
  baseSchema: TColumnDefinitions,
  opts?: TDataTypeEnricherOptions,
) => {
  const defs = generateDataTypeColumnDefs(opts);
  return { ...baseSchema, ...defs };
};

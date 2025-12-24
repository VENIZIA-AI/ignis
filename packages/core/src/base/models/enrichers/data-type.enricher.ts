import { boolean, customType, doublePrecision, jsonb, text } from 'drizzle-orm/pg-core';
import { TColumnDefinitions } from '../common/types';
import { AnyType } from '@/helpers';

export type TDataTypeEnricherOptions = {
  defaultValue: Partial<{
    dataType: string;
    nValue: number;
    tValue: string;
    bValue: Buffer;
    jValue: object;
    boValue: boolean;
  }>;
};

const byteaType = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const generateDataTypeColumnDefs = (opts?: TDataTypeEnricherOptions) => {
  const { defaultValue } = opts ?? {};

  return {
    dataType: defaultValue?.dataType
      ? text('data_type').default(defaultValue.dataType)
      : text('data_type'),
    nValue: defaultValue?.nValue
      ? doublePrecision('n_value').default(defaultValue.nValue)
      : doublePrecision('n_value'),
    tValue: defaultValue?.tValue ? text('t_value').default(defaultValue.tValue) : text('t_value'),
    bValue: defaultValue?.bValue
      ? byteaType('b_value').default(defaultValue.bValue)
      : byteaType('b_value'),
    jValue: defaultValue?.jValue
      ? jsonb('j_value').default(defaultValue.jValue).$type<Record<string, AnyType>>()
      : jsonb('j_value').$type<Record<string, AnyType>>(),
    boValue: defaultValue?.boValue
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

import type { AnyType } from '@venizia/ignis-helpers/common';
import { blob, integer, real, text } from 'drizzle-orm/sqlite-core';
import type { TColumnDefinitions, TDataTypeEnricherOptions } from '../common/types';

export class SqliteDataTypeEnricher {
  /**
   * Storage-class mapping of the Postgres twin: `double precision` -> `real`, `bytea` -> `blob`,
   * `boolean` -> `integer` 0/1, `jsonb` -> text-mode json so `json_extract` / `->>` can read it.
   */
  static generateColumnDefs(opts?: TDataTypeEnricherOptions) {
    const { defaultValue } = opts ?? {};

    // Gate on presence, not truthiness - `0`, `''` and `false` are legitimate defaults.
    return {
      dataType:
        defaultValue?.dataType !== undefined
          ? text('data_type').default(defaultValue.dataType)
          : text('data_type'),
      nValue:
        defaultValue?.nValue !== undefined
          ? real('n_value').default(defaultValue.nValue)
          : real('n_value'),
      tValue:
        defaultValue?.tValue !== undefined
          ? text('t_value').default(defaultValue.tValue)
          : text('t_value'),
      bValue:
        defaultValue?.bValue !== undefined
          ? blob('b_value', { mode: 'buffer' }).default(defaultValue.bValue)
          : blob('b_value', { mode: 'buffer' }),
      jValue:
        defaultValue?.jValue !== undefined
          ? text('j_value', { mode: 'json' })
              .default(defaultValue.jValue)
              .$type<Record<string, AnyType>>()
          : text('j_value', { mode: 'json' }).$type<Record<string, AnyType>>(),
      boValue:
        defaultValue?.boValue !== undefined
          ? integer('bo_value', { mode: 'boolean' }).default(defaultValue.boValue)
          : integer('bo_value', { mode: 'boolean' }),
    };
  }

  static enrich(opts: { baseSchema: TColumnDefinitions; opts?: TDataTypeEnricherOptions }) {
    const { baseSchema, opts: enricherOpts } = opts;
    const defs = SqliteDataTypeEnricher.generateColumnDefs(enricherOpts);

    return { ...baseSchema, ...defs };
  }
}

/** @deprecated Use SqliteDataTypeEnricher.generateColumnDefs(opts). Removed in 0.5. */
export const generateDataTypeColumnDefs = (opts?: TDataTypeEnricherOptions) =>
  SqliteDataTypeEnricher.generateColumnDefs(opts);

/** @deprecated Use SqliteDataTypeEnricher.enrich({ baseSchema, opts }). Removed in 0.5. */
export const enrichDataTypes = (baseSchema: TColumnDefinitions, opts?: TDataTypeEnricherOptions) =>
  SqliteDataTypeEnricher.enrich({ baseSchema, opts });

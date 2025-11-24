// ----------------------------------------------------------------------------------------------------------------------------------------
// Domain Types

import { ValueOrPromise } from '@/common';

// ----------------------------------------------------------------------------------------------------------------------------------------
export type TRelationType = 'belongsTo' | 'hasOne' | 'hasMany' | 'hasManyThrough';

export type TDataSourceDriver = 'node-postgres' | 'postgres-js';

// ----------------------------------------------------------------------------------------------------------------------------------------
// DataSource Interface
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IDataSource<S extends object = object, DS extends object = any> {
  name: string;
  settings: S;
  dataSource: DS;

  getSettings(): S;
  getDataSource(): DS;
  getConnectionString(): ValueOrPromise<string>;
}

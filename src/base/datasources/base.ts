import { ValueOrPromise } from '@/common/types';
import { BaseHelper } from '../helpers';
import { IDataSource, TDataSourceDriver } from './types';

export abstract class AbstractDataSource<S extends object = {}, DS = any>
  extends BaseHelper
  implements IDataSource
{
  name: string;
  settings: S;
  dataSource: DS;

  protected driver: TDataSourceDriver;

  constructor(opts: { name: string; config: S; driver: TDataSourceDriver }) {
    super({ scope: opts.name });

    this.name = opts.name;
    this.settings = opts.config;
    this.driver = opts.driver;
  }

  abstract configure(): ValueOrPromise<void>;
  abstract getConnectionString(): ValueOrPromise<string>;

  getSettings() {
    return this.settings;
  }

  getDataSource() {
    return this.dataSource;
  }
}

export abstract class BaseDataSource<
  C extends object = object,
  DS extends object = object,
> extends AbstractDataSource<C, DS> {}

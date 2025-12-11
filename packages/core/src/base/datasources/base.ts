import { BaseHelper, ValueOrPromise } from '@venizia/ignis-helpers';
import {
  IDataSource,
  TAnyDatasourceSchema,
  TDatabaseConnector,
  TDataSourceDriver,
  TNodePostgresConnector,
} from './types';

// --------------------------------------------------------------------------------------
export abstract class AbstractDataSource<
  Connector extends TDatabaseConnector = TNodePostgresConnector,
  Settings extends object = {},
  Schema extends TAnyDatasourceSchema = {},
  ConfigurableOptions extends object = {},
>
  extends BaseHelper
  implements IDataSource<Connector, Settings, Schema, ConfigurableOptions>
{
  name: string;
  settings: Settings;
  connector: Connector;
  schema: Schema;
  protected driver: TDataSourceDriver;

  abstract configure(opts?: ConfigurableOptions): ValueOrPromise<void>;
  abstract getConnectionString(): ValueOrPromise<string>;

  getSettings() {
    return this.settings;
  }

  getConnector() {
    return this.connector;
  }

  getSchema() {
    return this.schema;
  }
}

// --------------------------------------------------------------------------------------
export abstract class BaseDataSource<
  Connector extends TDatabaseConnector = TNodePostgresConnector,
  Settings extends object = {},
  Schema extends TAnyDatasourceSchema = {},
  ConfigurableOptions extends object = {},
> extends AbstractDataSource<Connector, Settings, Schema, ConfigurableOptions> {
  constructor(opts: { name: string; config: Settings; driver: TDataSourceDriver; schema: Schema }) {
    super({ scope: opts.name });

    this.name = opts.name;
    this.settings = opts.config;
    this.driver = opts.driver;
    this.schema = opts.schema;
  }
}

import { PostgresJsDriver } from '../../../../connectors/postgres/drivers/postgres-js';
import { BaseApplication } from '../../../../index';

export const marker = `${BaseApplication.name}:${PostgresJsDriver.name}`;

import { NodePostgresDriver } from '../../../../connectors/postgres/drivers/node-postgres';
import { BaseApplication } from '../../../../index';

export const marker = `${BaseApplication.name}:${NodePostgresDriver.name}`;

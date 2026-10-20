import { NodePostgresDriver } from '../../../relational/postgres/drivers/node-postgres';
import { FilterBuilder } from '../../../index';

export const marker = `${FilterBuilder.name}:${NodePostgresDriver.name}`;

import { PostgresJsDriver } from '../../../relational/postgres/drivers/postgres-js';
import { FilterBuilder } from '../../../index';

export const marker = `${FilterBuilder.name}:${PostgresJsDriver.name}`;

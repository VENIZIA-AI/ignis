import { BaseStringUserAuditTzEntity, enrichDataTypes, model } from '@vez/ignis';
import { text } from 'drizzle-orm/pg-core';

@model({ type: 'entity', skipMigrate: false })
export class Configuration extends BaseStringUserAuditTzEntity {
  constructor() {
    super({
      schema: 'public',
      name: Configuration.name,
      columns: { code: text('code') },
    });
    this.columns = enrichDataTypes(this.columns);
  }
}

export const configurationSchema = new Configuration().build();

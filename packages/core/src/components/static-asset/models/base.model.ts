import { model } from '@/base/metadata';
import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  TTableObject,
} from '@/base/models';
import { createRelations } from '@/base/repositories';
import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

const TABLE_NAME = 'MetaLink';

// ================================================================================
export const metaLinkTable = pgTable(
  TABLE_NAME,
  {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    bucketName: text('bucket_name').notNull(),
    objectName: text('object_name').notNull(),
    link: text().notNull(),
    mimetype: text().notNull(),
    size: integer().notNull(),
    etag: text(),
    metadata: jsonb().$type<Record<string, any>>(),
    storageType: text('storage_type').notNull(),
  },
  def => [
    index(`IDX_${TABLE_NAME}_bucketName`).on(def.bucketName),
    index(`IDX_${TABLE_NAME}_objectName`).on(def.objectName),
    index(`IDX_${TABLE_NAME}_storageType`).on(def.storageType),
  ],
);

// ================================================================================
export const metaLinkRelations = createRelations({
  source: metaLinkTable,
  relations: [],
});

// ================================================================================
export type TMetaLinkSchema = typeof metaLinkTable;
export type TMetaLink = TTableObject<TMetaLinkSchema>;

// ================================================================================
@model({ type: 'entity', skipMigrate: true })
export class BaseMetaLinkModel extends BaseEntity<TMetaLinkSchema> {
  static readonly TABLE_NAME = BaseMetaLinkModel.name;

  constructor() {
    super({
      name: BaseMetaLinkModel.TABLE_NAME,
      schema: metaLinkTable,
    });
  }
}

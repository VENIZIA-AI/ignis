import { model } from '@/base/metadata';
import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  TTableObject,
} from '@/base/models';
import { boolean, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

// ================================================================================
/**
 * BaseMetaLinkModel using static schema pattern.
 *
 * This model stores metadata about uploaded files/assets.
 */
@model({ type: 'entity', skipMigrate: true })
export class BaseMetaLinkModel extends BaseEntity<typeof BaseMetaLinkModel.schema> {
  static override schema = pgTable(
    'MetaLink',
    {
      ...generateIdColumnDefs(),
      ...generateTzColumnDefs(),
      bucketName: text('bucket_name').notNull(),
      objectName: text('object_name').notNull(),
      link: text().notNull(),
      mimetype: text().notNull(),
      size: integer().notNull(),
      etag: text(),
      metadata: jsonb().$type<Record<string, any>>(),
      storageType: text('storage_type').notNull(),
      isSynced: boolean('is_synced').notNull().default(false),
    },
    def => [
      index(`IDX_MetaLink_bucketName`).on(def.bucketName),
      index(`IDX_MetaLink_objectName`).on(def.objectName),
      index(`IDX_MetaLink_storageType`).on(def.storageType),
      index(`IDX_MetaLink_isSynced`).on(def.isSynced),
    ],
  );

  static override relations = () => [];
}

// ================================================================================
// Type exports
export type TMetaLinkSchema = typeof BaseMetaLinkModel.schema;
export type TMetaLink = TTableObject<TMetaLinkSchema>;

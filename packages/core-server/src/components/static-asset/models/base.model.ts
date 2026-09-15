import { model } from '@/base/metadata';
import {
  BaseRelationalEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  TTableObject,
  TTableSchemaWithId,
} from '@venizia/ignis-connectors/postgres';
import { boolean, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * One row per (object, owner) pairing, NOT one row per object. The same object legitimately carries
 * several rows - a product image attached to the product and to each of its variants is the common
 * case - so `(bucketName, objectName)` is deliberately indexed and NOT unique.
 */
@model({ type: 'entity', skipMigrate: true })
export class BaseMetaLinkModel extends BaseRelationalEntity<typeof BaseMetaLinkModel.schema> {
  static override schema = pgTable(
    'MetaLink',
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
      isSynced: boolean('is_synced').notNull().default(false),

      /** An opaque label the caller chooses - a size, a role, a rendition name. The component stores and returns it and reads no meaning into it. */
      variant: text(),

      /** A polymorphic owner: the type names the table, the id the row. Both nullable - an object may belong to nothing yet, which is how `recreate-metalink` writes one. */
      principalType: text('principal_type'),
      principalId: text('principal_id'),
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

export type TMetaLinkSchema = typeof BaseMetaLinkModel.schema;
export type TMetaLink = TTableObject<TMetaLinkSchema>;

/** Any table whose row carries the MetaLink fields. The component reads and writes the ROW, so the table is free to carry another name or to live in another Postgres schema. */
export type TMetaLinkCompatibleSchema = TTableSchemaWithId & { $inferSelect: TMetaLink };

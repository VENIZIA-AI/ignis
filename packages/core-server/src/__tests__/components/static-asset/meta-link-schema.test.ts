import 'reflect-metadata';

import { model } from '@/base/metadata';
import type { BaseApplication } from '@/base/applications';
import { StaticAssetComponent } from '@/components/static-asset';
import { StaticAssetStorageTypes } from '@/components/static-asset/common';
import type { DiskHelper } from '@venizia/ignis-helpers';
import type {
  TMetaLinkConfig,
  TStaticAssetsComponentOptions,
} from '@/components/static-asset/common';
import { BaseMetaLinkModel } from '@/components/static-asset/models';
import {
  BaseRelationalEntity,
  DefaultCRUDRepository,
  generateIdColumnDefs,
  generateTzColumnDefs,
} from '@venizia/ignis-connectors/postgres';
import { boolean, index, integer, jsonb, pgSchema, pgTable, text } from 'drizzle-orm/pg-core';
import { expect, test } from 'bun:test';

/**
 * The MetaLink table belongs to the application, not to IGNIS. An application is free to put it in
 * a Postgres schema of its own, and the option types have to accept that - the constraint is the
 * ROW the component reads and writes, never the table it happens to live in.
 */
const applicationSchema = pgSchema('commerce');

/** Every column `BaseMetaLinkModel.schema` declares, so only the Postgres schema differs. */
const metaLinkColumns = () => ({
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  bucketName: text('bucket_name').notNull(),
  objectName: text('object_name').notNull(),
  link: text().notNull(),
  mimetype: text().notNull(),
  size: integer().notNull(),
  etag: text(),
  metadata: jsonb().$type<Record<string, unknown>>(),
  storageType: text('storage_type').notNull(),
  isSynced: boolean('is_synced').notNull().default(false),
  variant: text(),
  sequence: integer().notNull().default(0),
  principalType: text('principal_type'),
  principalId: text('principal_id'),
});

@model({ type: 'entity', skipMigrate: true })
class NamespacedMetaLinkModel extends BaseRelationalEntity<typeof NamespacedMetaLinkModel.schema> {
  static override schema = applicationSchema.table('MetaLink', metaLinkColumns(), def => [
    index('IDX_Namespaced_MetaLink_bucketName').on(def.bucketName),
  ]);
}

/** `objectName` is missing. The component reads that field, so this table has to stay refused. */
@model({ type: 'entity', skipMigrate: true })
class IncompleteMetaLinkModel extends BaseRelationalEntity<typeof IncompleteMetaLinkModel.schema> {
  static override schema = pgTable('IncompleteMetaLink', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    bucketName: text('bucket_name').notNull(),
    link: text().notNull(),
    mimetype: text().notNull(),
    size: integer().notNull(),
    storageType: text('storage_type').notNull(),
    isSynced: boolean('is_synced').notNull().default(false),
  });
}

declare const defaultRepository: DefaultCRUDRepository<typeof BaseMetaLinkModel.schema>;
declare const namespacedRepository: DefaultCRUDRepository<typeof NamespacedMetaLinkModel.schema>;
declare const incompleteRepository: DefaultCRUDRepository<typeof IncompleteMetaLinkModel.schema>;
declare const diskHelper: DiskHelper;
declare const application: BaseApplication;

/**
 * Never called. `tsc` checks the body during the build, which is where these assertions run - the
 * repositories above are `declare`d, so evaluating this at module load would find nothing.
 */
export const metaLinkTypeAssertions = () => {
  /** The framework's own table keeps working with no type argument at all. */
  const defaultTable: TMetaLinkConfig = {
    model: BaseMetaLinkModel,
    repository: defaultRepository,
  };

  /** The same columns under `commerce` are accepted. */
  const namespacedTable: TMetaLinkConfig<typeof NamespacedMetaLinkModel.schema> = {
    model: NamespacedMetaLinkModel,
    repository: namespacedRepository,
  };

  /** And the component options carry that table through, which is the shape an application binds. */
  const namespacedOptions: TStaticAssetsComponentOptions<typeof NamespacedMetaLinkModel.schema> = {
    asset: {
      controller: { name: 'AssetController', basePath: '/assets' },
      storage: StaticAssetStorageTypes.DISK,
      helper: diskHelper,
      useMetaLink: true,
      metaLink: namespacedTable,
    },
  };

  /**
   * The shape a consumer reaches for after `component(Ctor, { options })` landed: options carrying
   * a namespaced table, handed straight to the component. The class has to be generic for this -
   * a bare `BaseComponent<TStaticAssetsComponentOptions>` pins the options to the shipped table.
   */
  const componentRegistration = () =>
    application.component(StaticAssetComponent, { options: namespacedOptions });

  const incompleteTable = {
    model: IncompleteMetaLinkModel,
    repository: incompleteRepository,
    // @ts-expect-error a table missing a MetaLink column stays refused, whatever its Postgres schema
  } satisfies TMetaLinkConfig<typeof IncompleteMetaLinkModel.schema>;

  return {
    defaultTable,
    namespacedTable,
    namespacedOptions,
    incompleteTable,
    componentRegistration,
  };
};

test('the MetaLink option types accept an application table in its own Postgres schema', () => {
  // The assertions above are checked by `tsc` during the build; this keeps the file in the suite.
  expect(NamespacedMetaLinkModel.schema).toBeDefined();
  expect(BaseMetaLinkModel.schema).toBeDefined();
});

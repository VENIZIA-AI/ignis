import type {
  IBucketRef,
  IFileStat,
  IObjectRef,
  IStorageHelper,
  IUploadResult,
} from '@venizia/ignis-helpers';
import { resolveValueAsync } from '@venizia/ignis-helpers/common';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { TMetaLinkConfig, TStaticAssetStorageType, TUploadQuery } from '../common';

/** What a stat says about one stored object: the columns a refresh rewrites and a new row starts from. */
const buildStoredObjectFacts = (opts: {
  helper: IStorageHelper;
  object: IObjectRef;
  link: string;
  fileStat: IFileStat;
}) => {
  const { helper, object, link, fileStat } = opts;

  return {
    link,
    // The column is NOT NULL and a backend may report nothing.
    mimetype: fileStat.metadata?.mimetype ?? helper.getMimeType({ filename: object.key }),
    size: fileStat.size,
    etag: fileStat.etag,
    metadata: fileStat.metadata,
    isSynced: true,
  };
};

/** The upload result of an object already in storage, so a commit or a recreate writes its row the way an upload does. */
export const buildStoredUploadResult = (opts: {
  helper: IStorageHelper;
  bucket: IBucketRef;
  object: IObjectRef;
  link: string;
  fileStat: IFileStat;
}): IUploadResult => {
  const { helper, bucket, object, link, fileStat } = opts;

  return {
    bucket,
    object: {
      key: object.key,
      size: fileStat.size,
      contentType: fileStat.metadata?.mimetype ?? helper.getMimeType({ filename: object.key }),
    },
    link,
  };
};

/** The MetaLink row for one stored object. Every path that creates a row goes through here, so each lands exactly the row an ordinary upload does. */
export const createMetaLinkRow = async (opts: {
  metaLink: TMetaLinkConfig<AnyType>;
  helper: IStorageHelper;
  storage: TStaticAssetStorageType;
  uploadResult: IUploadResult;
  fileStat: IFileStat;
  query: TUploadQuery;
}): Promise<AnyType> => {
  const { metaLink, helper, storage, uploadResult, fileStat, query } = opts;

  if (metaLink.createMetaLink) {
    const created = await metaLink.createMetaLink({ uploadResult, fileStat, query });
    return created.data;
  }

  // Resolved per call so an application that swaps the repository is not pinned to the first one.
  const repository = await resolveValueAsync({ value: metaLink.repository });
  const created = await repository.create({
    data: {
      bucketName: uploadResult.bucket.name,
      objectName: uploadResult.object.key,
      ...buildStoredObjectFacts({
        helper,
        object: uploadResult.object,
        link: uploadResult.link,
        fileStat,
      }),
      storageType: storage,
      principalId: query.principalId ? String(query.principalId) : undefined,
      principalType: query.principalType ? String(query.principalType) : undefined,
      variant: query.variant ? String(query.variant) : undefined,
      // Absent leaves the column default rather than writing 0, so a row the caller never
      // ordered is indistinguishable from a legacy one.
      sequence: query.sequence === undefined ? undefined : Number(query.sequence),
    },
  });

  return created.data;
};

/**
 * Rewrites the stored-object facts on every row of the pair. Rows per pair are deliberately not
 * unique, and each keeps its own labels and storage type. A `createMetaLink` hook owns `link` and
 * `metadata`, so with one only the stat columns change; without one, `metadata` is merged per row.
 */
export const refreshMetaLinkRows = async (opts: {
  metaLink: TMetaLinkConfig<AnyType>;
  helper: IStorageHelper;
  bucket: IBucketRef;
  object: IObjectRef;
  link: string;
  fileStat: IFileStat;
}): Promise<{ count: number; data: AnyType[] }> => {
  const { metaLink, helper, bucket, object, link, fileStat } = opts;

  const repository = await resolveValueAsync({ value: metaLink.repository });
  const { mimetype, size, etag, isSynced } = buildStoredObjectFacts({
    helper,
    object,
    link,
    fileStat,
  });
  const statColumns = { mimetype, size, etag, isSynced };

  const updated = await repository.updateAll({
    data: metaLink.createMetaLink ? statColumns : { ...statColumns, link },
    where: { bucketName: bucket.name, objectName: object.key },
  });
  const rows = updated.data ?? [];

  if (metaLink.createMetaLink || !fileStat.metadata) {
    return { count: updated.count, data: rows };
  }

  // One UPDATE per row: each merge starts from that row's own keys, which the statement above
  // returned untouched and which no single engine-neutral statement over the pair can express.
  const merged = await Promise.all(
    rows.map(row =>
      repository.updateById({
        id: row.id,
        data: { metadata: { ...row.metadata, ...fileStat.metadata } },
      }),
    ),
  );

  return { count: updated.count, data: merged.map(result => result.data) };
};

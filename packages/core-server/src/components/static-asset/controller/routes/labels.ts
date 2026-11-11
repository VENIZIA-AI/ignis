import { z } from '@hono/zod-openapi';
import { getError } from '@venizia/ignis-helpers/core';
import { StaticAssetErrors, type TStaticAssetUploadQuery } from '../../common';

/** The upload labels: one list, so the reader and the query refusal agree. */
export const UPLOAD_LABEL_NAMES = [
  'principalType',
  'principalId',
  'variant',
  'sequence',
  'folderPath',
] as const;

/** The commit body carries four of the five: the object key - and so `folderPath` - was fixed when the policy was issued. */
export const COMMIT_LABEL_NAMES = UPLOAD_LABEL_NAMES.filter((name) => name !== 'folderPath');

/** The labels both upload paths take. They ride the BODY, not the URL - an identifier in a query string lands in every access log between the client and here. */
export const uploadLabelsShape = () => ({
  principalType: z.string().optional(),
  principalId: z.string().or(z.number()).optional(),
  variant: z.string().optional(),
  sequence: z.coerce.number().int().optional(),
});

/** Refused before the body is read: a route that ignored them would store an unlabelled row. */
export const refuseLabelsInQuery = (opts: {
  query: Record<string, string>;
  names?: ReadonlyArray<(typeof UPLOAD_LABEL_NAMES)[number]>;
  reason?: string;
}): void => {
  const names = (opts.names ?? UPLOAD_LABEL_NAMES).filter((name) => opts.query[name] !== undefined);

  if (names.length > 0) {
    throw getError({
      error: StaticAssetErrors.LABELS_IN_QUERY,
      message: `${opts.reason ?? 'Upload labels belong in the request body, not the query'} | names: ${names.join(', ')}`,
    });
  }
};

// A multipart form hands strings; a JSON commit body may hand `sequence` as a number.
export const readUploadLabels = (opts: {
  fields: Partial<Record<(typeof UPLOAD_LABEL_NAMES)[number], string | number>>;
}): TStaticAssetUploadQuery => {
  const { fields } = opts;

  const read = (name: (typeof UPLOAD_LABEL_NAMES)[number]) => {
    const value = fields[name];

    return value === undefined || value === '' ? undefined : String(value);
  };

  const sequence = read('sequence');

  return {
    principalType: read('principalType'),
    principalId: read('principalId'),
    variant: read('variant'),
    sequence: sequence === undefined ? undefined : Number(sequence),
    folderPath: read('folderPath'),
  };
};

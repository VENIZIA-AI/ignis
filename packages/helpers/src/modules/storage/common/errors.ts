import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-inversion';
import { ErrorScopes } from '@venizia/ignis-inversion';
import { HTTP } from '@/common/constants';

/** Codes a caller branches on for a storage failure that is the request's fault, not the backend's. */
export const StorageErrors = {
  OBJECT_NOT_FOUND: {
    message: { text: 'Object not found', code: 'core.storage.object_not_found' },
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
    category: ErrorScopes.BUSINESS,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Augments inversion, not helpers: TS only treats this as an augmentation when the file imports that module. */
declare module '@venizia/ignis-inversion' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof StorageErrors> {}
}

/** "Not there", across SDKs. Both minio and Bun report `S3Error` in `name`, so `code` and status decide. */
export const isNotFoundError = (opts: { error: unknown }): boolean => {
  const { error } = opts;
  const source = error as { statusCode?: number; status?: number; code?: string; name?: string };

  if (source?.statusCode === HTTP.ResultCodes.RS_4.NotFound || source?.status === 404) {
    return true;
  }

  const marker = `${source?.code ?? ''} ${source?.name ?? ''}`.toLowerCase();

  return ['nosuchkey', 'nosuchbucket', 'notfound'].some(needle => marker.includes(needle));
};

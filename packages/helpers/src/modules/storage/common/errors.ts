import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-inversion';
import { ErrorScopes } from '@venizia/ignis-inversion';
import { HTTP } from '@/common/constants';
import { StorageUtility } from './utility';

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

/** @deprecated Use StorageUtility.isNotFoundError({ error }). Removed in 0.5. */
export const isNotFoundError = (opts: { error: unknown }): boolean =>
  StorageUtility.isNotFoundError(opts);

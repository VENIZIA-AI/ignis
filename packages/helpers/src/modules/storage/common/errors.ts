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
  /** A read or copy that named the content it expects (an ETag or a version) found other content. */
  PRECONDITION_FAILED: {
    message: {
      text: 'The object no longer matches what was expected',
      code: 'core.storage.precondition_failed',
    },
    statusCode: HTTP.ResultCodes.RS_4.PreconditionFailed,
    category: ErrorScopes.BUSINESS,
  },
  /** An upload named a folder the storage refuses: a segment it cannot hold, or an empty path. */
  FOLDER_PATH_INVALID: {
    message: { text: 'Invalid folder path', code: 'core.storage.folder_path_invalid' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  FOLDER_DEPTH_EXCEEDED: {
    message: {
      text: 'Folder path exceeds the maximum depth',
      code: 'core.storage.folder_depth_exceeded',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Augments inversion, not helpers: TS only treats this as an augmentation when the file imports that module. */
declare module '@venizia/ignis-inversion' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof StorageErrors> {}
}

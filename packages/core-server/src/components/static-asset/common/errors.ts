import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers/core';
import { ErrorScopes } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

/** Codes a client branches on for a rejected static-asset request. A throw site may override `message` to name the offending value. */
export const StaticAssetErrors = {
  UPLOAD_NOT_AUTHORIZED: {
    message: {
      text: 'Not allowed to request an upload policy',
      code: 'core.static_asset.upload_not_authorized',
    },
    statusCode: HTTP.ResultCodes.RS_4.Forbidden,
    category: ErrorScopes.VALIDATION,
  },
  /** Both upload paths - one condition, one code to branch on. */
  UPLOAD_TOO_LARGE: {
    message: {
      text: 'File is larger than the maximum allowed',
      code: 'core.static_asset.upload_too_large',
    },
    statusCode: HTTP.ResultCodes.RS_4.ContentTooLarge,
    category: ErrorScopes.VALIDATION,
  },
  /** Deliberately not 404 and deliberately not "expired": a caller learns only that the token is no good, never whether the key it names exists. */
  INVALID_COMMIT_TOKEN: {
    message: { text: 'Invalid commit token', code: 'core.static_asset.invalid_commit_token' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  EXPIRED_COMMIT_TOKEN: {
    message: { text: 'Commit token has expired', code: 'core.static_asset.expired_commit_token' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  /** Labels ride the body; one in the URL would otherwise leave the row unlabelled without a word. */
  LABELS_IN_QUERY: {
    message: {
      text: 'Upload labels belong in the request body, not the query',
      code: 'core.static_asset.labels_in_query',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  BUCKET_NAME_INVALID: {
    message: { text: 'Invalid bucket name', code: 'core.static_asset.bucket_name_invalid' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  OBJECT_NAME_INVALID: {
    message: {
      text: 'Invalid object name or path',
      code: 'core.static_asset.object_name_invalid',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  FOLDER_PATH_INVALID: {
    message: { text: 'Invalid folder path', code: 'core.static_asset.folder_path_invalid' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  FOLDER_SEGMENT_INVALID: {
    message: {
      text: 'Invalid folder path segment',
      code: 'core.static_asset.folder_segment_invalid',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  FOLDER_DEPTH_EXCEEDED: {
    message: {
      text: 'Folder path exceeds the maximum depth',
      code: 'core.static_asset.folder_depth_exceeded',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  FILE_EMPTY: {
    message: { text: 'Empty file content', code: 'core.static_asset.file_empty' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  MAX_KEYS_INVALID: {
    message: {
      text: 'Invalid maxKeys - expected a positive integer',
      code: 'core.static_asset.max_keys_invalid',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. */
declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof StaticAssetErrors> {}
}

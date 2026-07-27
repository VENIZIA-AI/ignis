import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers';
import { ErrorScopes, HTTP } from '@venizia/ignis-helpers';

/** Codes a client branches on for a rejected static-asset request. A throw site may override `message` to name the offending value. */
export const StaticAssetErrors = {
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

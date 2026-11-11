import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers/core';
import { ErrorScopes } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

/** Codes a client branches on for a rejected static-asset request. A throw site may override `message` to name the offending value. */
export const StaticAssetErrors = {
  UPLOAD_NOT_AUTHORIZED: {
    message: {
      text: 'Not allowed to upload',
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
  /** The pending object is not the one that was read: it was overwritten or removed after the pin. Raised by a pinned read and by the commit copy. */
  UPLOAD_CHANGED: {
    message: {
      text: 'The uploaded file changed after it was validated',
      code: 'core.static_asset.upload_changed',
    },
    statusCode: HTTP.ResultCodes.RS_4.Conflict,
    category: ErrorScopes.VALIDATION,
  },
  /** With a `validation` on, `commit` takes the token `upload-validate` returned, not the one the policy issued. */
  UPLOAD_NOT_VALIDATED: {
    message: {
      text: 'The upload has not been validated',
      code: 'core.static_asset.upload_not_validated',
    },
    statusCode: HTTP.ResultCodes.RS_4.UnprocessableEntity,
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
  /** The application's naming hook produced a key outside the entry's `keyPrefix`; nothing is written. */
  OBJECT_KEY_OUT_OF_SCOPE: {
    message: {
      text: 'Object key is outside the key prefix of this controller',
      code: 'core.static_asset.object_key_out_of_scope',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
  FILE_EMPTY: {
    message: { text: 'Empty file content', code: 'core.static_asset.file_empty' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. */
declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof StaticAssetErrors> {}
}

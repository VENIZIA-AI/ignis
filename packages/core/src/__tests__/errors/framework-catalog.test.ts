import { describe, expect, test } from 'bun:test';
import { getError, MessageCode } from '@venizia/ignis-helpers';
import { RequestErrors } from '@/base/middlewares';
import { RepositoryErrors } from '@/base/repositories/common';
import { AuthenticationErrors } from '@/components/auth/authenticate/common';
import { AuthorizationErrors } from '@/components/auth/authorize/common';
import { MailErrors } from '@/components/mail/common';
import { StaticAssetErrors } from '@/components/static-asset/common';
import { SearchErrors } from '@/connectors/search/common';

const CATALOGS = {
  AuthenticationErrors,
  AuthorizationErrors,
  StaticAssetErrors,
  RepositoryErrors,
  RequestErrors,
  SearchErrors,
  MailErrors,
};

/** These codes are a PUBLIC contract - a client branches on them, so a rename is breaking and must fail here first. */
const PINNED = [
  'core.authentication.header_missing',
  'core.authentication.scheme_invalid',
  'core.authentication.header_malformed',
  'core.authentication.token_missing',
  'core.authentication.token_invalid',
  'core.authentication.token_payload_invalid',
  'core.authentication.credentials_malformed',
  'core.authentication.credentials_invalid',
  'core.authentication.failed',
  'core.authentication.user_unresolved',
  'core.authorization.unauthenticated',
  'core.authorization.denied',
  'core.authorization.denied_by_voter',
  'core.authorization.principal_type_missing',
  'core.authorization.cache_key_invalid',
  'core.static_asset.bucket_name_invalid',
  'core.static_asset.object_name_invalid',
  'core.static_asset.folder_path_invalid',
  'core.static_asset.folder_segment_invalid',
  'core.static_asset.folder_depth_exceeded',
  'core.static_asset.file_empty',
  'core.static_asset.max_keys_invalid',
  'core.repository.entity_not_found',
  'core.request.body_malformed',
  'core.search_engine.not_found',
  'core.search_engine.already_exists',
  'core.search_engine.unknown_field',
  'core.search_engine.unsupported_operator',
  'core.search_engine.page_too_large',
  'core.mail.template_not_found',
  'core.mail.invalid_configuration',
  'core.mail.invalid_recipient',
];

const allDefinitions = Object.values(CATALOGS).flatMap(catalog => Object.values(catalog));

describe('framework error catalog', () => {
  test('every published code is still exactly what clients branch on', () => {
    const codes = allDefinitions.map(definition => definition.message.code).sort();

    expect(codes).toEqual([...PINNED].sort());
  });

  test('every code is well-formed and none is the default sentinel', () => {
    for (const definition of allDefinitions) {
      expect(MessageCode.isValid(definition.message.code)).toBe(true);
      expect(definition.message.code).not.toBe(MessageCode.DEFAULT);
    }
  });

  test('no two catalogued errors share a code', () => {
    const codes = allDefinitions.map(definition => definition.message.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  test('every catalogued error carries a 4xx status - these are the caller-facing ones', () => {
    for (const definition of allDefinitions) {
      expect(definition.statusCode).toBeGreaterThanOrEqual(400);
      expect(definition.statusCode).toBeLessThan(500);
    }
  });

  /** The whole point of the change: a client used to receive `core.system_error` for every one of these. */
  test('raising by definition yields the code, not the default sentinel', () => {
    const error = getError({ error: AuthenticationErrors.TOKEN_INVALID });

    expect(error.normalized.code).toBe('core.authentication.token_invalid');
    expect(error.statusCode).toBe(401);
  });

  test('a message override keeps the definition code', () => {
    const error = getError({
      error: AuthenticationErrors.FAILED,
      message: 'Authentication failed. Tried strategies: jwt, basic',
    });

    expect(error.message).toBe('Authentication failed. Tried strategies: jwt, basic');
    expect(error.normalized.code).toBe('core.authentication.failed');
  });
});

import { describe, expect, test } from 'bun:test';
import {
  AuthorizationDomainSources,
  type IAuthorizationDomainSource,
  type ICompressOptions,
  type IJWKSIssuerOptions,
  AuthorizeModelFormats,
  CompressEncodings,
  IdSchemaTypes,
  JWKSAlgorithms,
  RoutePathScopes,
  type TIdSchemaType,
} from '@/index';

/**
 * Each string domain that used to be a raw literal union is a const class now. The values stay the
 * same, so a consumer that still writes the literal ('gzip', 'EdDSA', ...) keeps compiling: the
 * literals below are assigned to the public types on purpose.
 */
describe('string domains as const classes', () => {
  const domains = [
    { name: 'CompressEncodings', domain: CompressEncodings, values: ['gzip', 'deflate'] },
    { name: 'JWKSAlgorithms', domain: JWKSAlgorithms, values: ['ES256', 'RS256', 'EdDSA'] },
    {
      name: 'AuthorizationDomainSources',
      domain: AuthorizationDomainSources,
      values: ['param', 'header', 'query', 'context'],
    },
    { name: 'RoutePathScopes', domain: RoutePathScopes, values: ['static', 'param', 'all'] },
    { name: 'IdSchemaTypes', domain: IdSchemaTypes, values: ['number', 'string'] },
    { name: 'AuthorizeModelFormats', domain: AuthorizeModelFormats, values: ['array', 'record'] },
  ];

  for (const { name, domain, values } of domains) {
    test(`${name} holds exactly its old literals and validates them`, () => {
      expect([...domain.SCHEME_SET]).toEqual(values);

      for (const value of values) {
        expect(domain.isValid(value)).toBe(true);
      }
      expect(domain.isValid('nope')).toBe(false);
      expect(domain.isValid('')).toBe(false);
    });
  }

  test('the public types still accept the plain literals', () => {
    const compress: ICompressOptions = { enable: true, encoding: 'gzip' };
    const source: IAuthorizationDomainSource = { from: 'header', key: 'x-m', type: 'Merchant' };
    const idType: TIdSchemaType = 'number';
    const algorithm: IJWKSIssuerOptions['algorithm'] = 'EdDSA';

    expect([compress.encoding, source.from, idType, algorithm]).toEqual([
      'gzip',
      'header',
      'number',
      'EdDSA',
    ]);
  });
});

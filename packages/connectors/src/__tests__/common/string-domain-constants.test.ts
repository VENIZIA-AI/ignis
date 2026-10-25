import { describe, expect, test } from 'bun:test';
import { HttpReadShapes } from '@/http/common/constants';
import { ScopeWriteOperations } from '@/relational/core/repositories/common/constants';
import { BigIntModes } from '@/relational/postgres/models/common/constants';
import type { TEnricherIdSample } from './string-domain-constants.types';

/**
 * Each string domain that used to be a raw literal union is a const class now. The values are the
 * same, so a consumer that writes the literal keeps compiling (see the types file next to this test).
 */
describe('string domains as const classes', () => {
  const domains = [
    { name: 'HttpReadShapes', domain: HttpReadShapes, values: ['list', 'one'] },
    { name: 'ScopeWriteOperations', domain: ScopeWriteOperations, values: ['create', 'update'] },
    { name: 'BigIntModes', domain: BigIntModes, values: ['number', 'bigint'] },
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

  test('the public option types still accept the plain literals', () => {
    const sample: TEnricherIdSample = {
      polymorphicIdType: 'string',
      dataType: 'number',
      mode: 'bigint',
    };

    expect(sample).toEqual({ polymorphicIdType: 'string', dataType: 'number', mode: 'bigint' });
  });
});

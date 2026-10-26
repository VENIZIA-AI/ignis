import { describe, expect, test } from 'bun:test';
import { FieldMappingDataTypes, type IFieldMapping } from '@/common/types';
import { AESAlgorithms, type AESAlgorithmType } from '@/modules/crypto/algorithms/aes.algorithm';
import { PinoFrequencies, type TFrequency } from '@/modules/logger/pino/common';
import { FetcherVariants, type TFetcherVariant } from '@/modules/network/http-request/common';
import { TcpClientStates, type ITcpSocketClient } from '@/modules/network/tcp-socket';
import { BullQueueRoles, type TBullQueueRole } from '@/modules/queue/common';
import { KafkaBrokersDownReasons } from '@/modules/queue/kafka/common/constants';
import { TemporalNameWidths, TemporalWrittenDateStyles } from '@/modules/temporal/common/constants';
import { PatternTokens, type TPatternToken } from '@/modules/temporal/pattern/common';
import { ContentDispositionTypes } from '@/utilities/request.utility';

/**
 * Each string domain that used to be a raw literal union is a const class now. The values are the
 * same, so a consumer that writes the literal keeps compiling: the literals below are assigned to the
 * public types on purpose.
 */
describe('string domains as const classes', () => {
  const domains = [
    {
      name: 'FieldMappingDataTypes',
      domain: FieldMappingDataTypes,
      values: ['string', 'number', 'strings', 'numbers', 'boolean'],
    },
    { name: 'AESAlgorithms', domain: AESAlgorithms, values: ['aes-256-cbc', 'aes-256-gcm'] },
    { name: 'PinoFrequencies', domain: PinoFrequencies, values: ['hourly', 'daily'] },
    { name: 'FetcherVariants', domain: FetcherVariants, values: ['node-fetch', 'axios'] },
    { name: 'BullQueueRoles', domain: BullQueueRoles, values: ['queue', 'worker'] },
    {
      name: 'TcpClientStates',
      domain: TcpClientStates,
      values: ['unauthorized', 'authenticating', 'authenticated'],
    },
    {
      name: 'KafkaBrokersDownReasons',
      domain: KafkaBrokersDownReasons,
      values: ['disconnected', 'failed'],
    },
    {
      name: 'ContentDispositionTypes',
      domain: ContentDispositionTypes,
      values: ['attachment', 'inline'],
    },
    { name: 'TemporalNameWidths', domain: TemporalNameWidths, values: ['narrow', 'short', 'long'] },
    {
      name: 'TemporalWrittenDateStyles',
      domain: TemporalWrittenDateStyles,
      values: ['numeric', 'long'],
    },
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

  test('PatternTokens holds the 27 tokens the dialect documents', () => {
    const documented =
      'YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ MMMM MMM dddd ddd dd A a hh h LL L Q'.split(' ');

    expect([...PatternTokens.SCHEME_SET].sort()).toEqual([...documented].sort());
    expect(PatternTokens.WRITE_ONLY_SET.size).toBe(12);
    expect(PatternTokens.isValid('YYYY')).toBe(true);
    expect(PatternTokens.isValid('yyyy')).toBe(false);
  });

  test('the public types still accept the plain literals', () => {
    const mapping: IFieldMapping = { name: 'tags', type: 'strings' };
    const algorithm: AESAlgorithmType = 'aes-256-gcm';
    const frequency: TFrequency = 'hourly';
    const variant: TFetcherVariant = 'axios';
    const role: TBullQueueRole = 'worker';
    const token: TPatternToken = 'MMMM';
    const state: ITcpSocketClient<unknown>['state'] = 'authenticating';

    expect([mapping.type, algorithm, frequency, variant, role, token, state]).toEqual([
      'strings',
      'aes-256-gcm',
      'hourly',
      'axios',
      'worker',
      'MMMM',
      'authenticating',
    ]);
  });
});

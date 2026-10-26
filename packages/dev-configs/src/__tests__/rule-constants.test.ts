import { describe, expect, test } from 'bun:test';
import {
  EqeqeqModes,
  EqeqeqRule,
  NoUnusedVarsRule,
  RuleSeverities,
  SwitchCaseBracesModes,
  SwitchCaseBracesRule,
  UnusedArgsModes,
  UnusedVarsScopes,
} from '../linters/rules';

describe('rule option const classes', () => {
  const domains = [
    { name: 'RuleSeverities', domain: RuleSeverities, values: ['off', 'warn', 'error'] },
    { name: 'EqeqeqModes', domain: EqeqeqModes, values: ['always', 'smart'] },
    { name: 'UnusedVarsScopes', domain: UnusedVarsScopes, values: ['all', 'local'] },
    { name: 'UnusedArgsModes', domain: UnusedArgsModes, values: ['all', 'after-used', 'none'] },
    { name: 'SwitchCaseBracesModes', domain: SwitchCaseBracesModes, values: ['always', 'avoid'] },
  ];

  for (const { name, domain, values } of domains) {
    test(`${name} holds exactly its old literals and validates them`, () => {
      expect([...domain.SCHEME_SET]).toEqual(values);

      for (const value of values) {
        expect(domain.isValid(value)).toBe(true);
      }
      expect(domain.isValid('nope')).toBe(false);
    });
  }

  test('the builders keep their defaults and still take the plain literals', () => {
    expect(EqeqeqRule.build()).toEqual(['error', 'smart']);
    expect(EqeqeqRule.build({ severity: 'warn', mode: 'always' })).toEqual(['warn', 'always']);
    expect(SwitchCaseBracesRule.build()).toEqual(['error', 'always']);
    expect(SwitchCaseBracesRule.build({ mode: 'avoid' })).toEqual(['error', 'avoid']);
    expect(NoUnusedVarsRule.build({ vars: 'local', args: 'after-used' })).toEqual([
      'error',
      expect.objectContaining({ vars: 'local', args: 'after-used' }),
    ]);
    expect(NoUnusedVarsRule.build()).toEqual([
      'error',
      expect.objectContaining({ vars: 'all', args: 'none' }),
    ]);
  });
});

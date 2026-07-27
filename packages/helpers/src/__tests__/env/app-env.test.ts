import type { AnyType } from '@/common/types';
import { describe, expect, test } from 'bun:test';
import { ApplicationEnvironment } from '@/modules/env';
import { toDelimitedArray, toTrimmed } from '@/utilities/parse.utility';

const makeEnvironment = (values: Record<string, string>) => {
  return new ApplicationEnvironment({ prefix: 'APP_ENV', envs: values });
};

describe('ApplicationEnvironment.get - options form', () => {
  test('plain get returns the raw value', () => {
    const environment = makeEnvironment({ APP_ENV_PLAIN: 'value-1' });
    expect(environment.get<string>('APP_ENV_PLAIN')).toBe('value-1');
  });

  test('defaultValue applies when the key is absent', () => {
    const environment = makeEnvironment({});
    expect(environment.get<string>('APP_ENV_MISSING', { defaultValue: 'fallback' })).toBe(
      'fallback',
    );
  });

  test('transform runs on the raw value', () => {
    const environment = makeEnvironment({ APP_ENV_NODES: ' a:1 , b:2 ,, c:3 ' });
    const nodes = environment.get<string[]>('APP_ENV_NODES', {
      transform: value => toDelimitedArray(value),
    });
    expect(nodes).toEqual(['a:1', 'b:2', 'c:3']);
  });

  test('defaultValue applies when transform yields null/undefined', () => {
    const environment = makeEnvironment({});
    const value = environment.get<string>('APP_ENV_MISSING_2', {
      defaultValue: 'after-transform-fallback',
      transform: () => undefined as AnyType,
    });
    expect(value).toBe('after-transform-fallback');
  });
});

describe('env transforms', () => {
  test('toDelimitedArray splits, trims, and drops empties', () => {
    expect(toDelimitedArray(' one, two ,, three ')).toEqual(['one', 'two', 'three']);
    expect(toDelimitedArray(undefined)).toEqual([]);
    expect(toDelimitedArray('a|b| c', '|')).toEqual(['a', 'b', 'c']);
  });

  test('toTrimmed normalizes absent values to empty string', () => {
    expect(toTrimmed('  padded  ')).toBe('padded');
    expect(toTrimmed(undefined)).toBe('');
  });
});

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

describe('ApplicationEnvironment.get - a present-but-empty value', () => {
  test('an empty value falls back to defaultValue', () => {
    const environment = makeEnvironment({ APP_ENV_EMPTY: '' });
    expect(environment.get<string>('APP_ENV_EMPTY', { defaultValue: 'fallback' })).toBe('fallback');
  });

  test('a whitespace-only value falls back too - a hand-edited env file pads', () => {
    const environment = makeEnvironment({ APP_ENV_BLANK: '   ' });
    expect(environment.get<string>('APP_ENV_BLANK', { defaultValue: 'fallback' })).toBe('fallback');
  });

  test('transform never sees the empty value, it sees undefined', () => {
    const environment = makeEnvironment({ APP_ENV_EMPTY_2: '' });
    const seen: Array<unknown> = [];
    const value = environment.get<string>('APP_ENV_EMPTY_2', {
      defaultValue: 'fallback',
      transform: raw => {
        seen.push(raw);
        return raw as AnyType;
      },
    });
    expect(seen).toEqual([undefined]);
    expect(value).toBe('fallback');
  });

  test('with NO defaultValue an empty value is still returned as-is', () => {
    const environment = makeEnvironment({ APP_ENV_EMPTY_3: '' });
    expect(environment.get<string>('APP_ENV_EMPTY_3')).toBe('');
  });

  test('a meaningful falsy value is untouched', () => {
    const environment = makeEnvironment({ APP_ENV_ZERO: '0', APP_ENV_FALSE: 'false' });
    expect(environment.get<string>('APP_ENV_ZERO', { defaultValue: '9' })).toBe('0');
    expect(environment.get<string>('APP_ENV_FALSE', { defaultValue: 'true' })).toBe('false');
  });
});

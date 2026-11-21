import { HttpHeaders } from '@/modules/network/http-request/fetcher/common/utilities';
import { describe, expect, test } from 'bun:test';

describe('HttpHeaders.merge', () => {
  test('reads [name, value] pairs, the last spelling of a name winning', () => {
    const merged = HttpHeaders.merge({
      layers: [
        [
          ['X-Tenant', 'north'],
          ['x-tenant', 'south'],
        ],
      ],
    });

    expect(merged.get('x-tenant')).toBe('south');
  });

  test('sends a number as text and removes a header for null or undefined', () => {
    const merged = HttpHeaders.merge({
      layers: [
        { 'x-a': '1', 'x-b': '2' },
        { 'x-a': null, 'x-c': 3, 'x-b': undefined },
      ],
    });

    expect(merged.has('x-a')).toBe(false);
    expect(merged.has('x-b')).toBe(false);
    expect(merged.get('x-c')).toBe('3');
  });

  test('a later layer of any kind wins over an earlier one', () => {
    const merged = HttpHeaders.merge({
      layers: [{ 'x-a': '1' }, new Headers({ 'x-a': '2' }), [['x-a', '3']], undefined],
    });

    expect(merged.get('x-a')).toBe('3');
  });
});

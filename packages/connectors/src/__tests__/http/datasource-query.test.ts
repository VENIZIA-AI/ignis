import { HttpDataSource } from '@/http/datasource';
import { describe, expect, test } from 'bun:test';

const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com/v1' });
const build = (query: Record<string, unknown>) => dataSource.buildUrl({ paths: ['x'], query });

/** The query rule is the helpers' `toQueryString`: one encoder for the fetchers and for this data source. */
describe('HttpDataSource.buildUrl query values', () => {
  test('a null, an undefined and an empty array leave the pair out', () => {
    expect(build({ a: '', b: undefined, c: null, d: [], e: 1 })).toBe(
      'https://api.example.com/v1/x?a=&e=1',
    );
  });

  test('a list repeats its key', () => {
    expect(build({ arr: [1, 2] })).toBe('https://api.example.com/v1/x?arr=1&arr=2');
  });

  test('an object is one JSON parameter: the filter wire the HTTP repository sends', () => {
    expect(build({ filter: { where: { id: 1 }, limit: 1 } })).toBe(
      `https://api.example.com/v1/x?filter=${encodeURIComponent('{"where":{"id":1},"limit":1}')}`,
    );
  });

  test('a string, a number and a boolean are written as they read', () => {
    expect(build({ s: 'a b', n: 2, t: true })).toBe(
      'https://api.example.com/v1/x?s=a%20b&n=2&t=true',
    );
  });

  test('a path that carries its own query keeps it, and the parameters follow', () => {
    expect(dataSource.buildUrl({ paths: ['x?y=1'], query: { z: 2 } })).toBe(
      'https://api.example.com/v1/x?y=1&z=2',
    );
  });

  test('no query leaves the url as it was', () => {
    expect(dataSource.buildUrl({ paths: ['x'] })).toBe('https://api.example.com/v1/x');
  });
});

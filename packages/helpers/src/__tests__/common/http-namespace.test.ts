// `HTTP` is a module namespace: its public surface is these groups, in the member order each group declares.
import { HTTP } from '@/common';
import * as common from '@/common';
import { describe, expect, test } from 'bun:test';

describe('HTTP', () => {
  test('publishes exactly its six groups', () => {
    expect(Object.keys(HTTP).sort()).toEqual([
      'CorsHeaders',
      'HeaderValues',
      'Headers',
      'Methods',
      'Protocols',
      'ResultCodes',
    ]);
  });

  test('keeps the order of the members of a group', () => {
    expect(Object.values(HTTP.Methods)).toEqual([
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
      'query',
    ]);
    expect(Object.keys(HTTP.ResultCodes)).toEqual(['RS_1', 'RS_2', 'RS_3', 'RS_4', 'RS_5']);
    expect(Object.keys(HTTP.Headers).slice(0, 3)).toEqual([
      'CONTENT_DISPOSITION',
      'CONTENT_ENCODING',
      'CONTENT_LENGTH',
    ]);
  });

  test('exports no group beside the namespace', () => {
    for (const group of Object.keys(HTTP)) {
      expect(Object.keys(common)).not.toContain(group);
    }
  });
});

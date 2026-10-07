import { HttpResponseReader } from '@/base/repositories/common/response-reader';
import { describe, expect, test } from 'bun:test';

const marked = new Headers({ 'x-response-extra': 'counts' });
const rows = [{ id: 1 }];

describe('HttpResponseReader.readExtra', () => {
  test('a marked body without count gives the rows and the extra', () => {
    expect(
      HttpResponseReader.readExtra({ body: { data: rows, extra: { counts: 1 } }, headers: marked }),
    ).toEqual({ body: rows, extra: { counts: 1 } });
  });

  test('a marked body with count keeps the { count, data } envelope', () => {
    expect(
      HttpResponseReader.readExtra({
        body: { count: 1, data: rows, extra: { counts: 1 } },
        headers: marked,
      }),
    ).toEqual({ body: { count: 1, data: rows }, extra: { counts: 1 } });
  });

  test('an unmarked body is returned as it stands', () => {
    const body = { count: 1, data: rows, extra: { counts: 1 } };
    expect(HttpResponseReader.readExtra({ body, headers: new Headers() })).toEqual({ body });
  });
});

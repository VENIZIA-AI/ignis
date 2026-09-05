import { describe, expect, test } from 'bun:test';
import { HTTP } from '@venizia/ignis-helpers/common';
import { ResponseFormats } from '@/base/controllers/common';
import type { TRouteContext } from '@/base/controllers/common';
import { BaseRestController } from '@/base/controllers/rest/base';

class ItemsController extends BaseRestController {
  constructor() {
    super({ scope: ItemsController.name, path: '/items' });
  }

  binding() {
    // No routes: only the response helpers are under test.
  }
}

/** Minimal `TRouteContext` fake: records response headers and echoes request headers - the only members the response helpers touch. */
const fakeContext = (opts: { requestHeaders?: Record<string, string> } = {}) => {
  const responseHeaders: Record<string, string> = {};
  const requestHeaders = opts.requestHeaders ?? {};
  const fake = {
    req: {
      header: (name: string) => requestHeaders[name.toLowerCase()],
      valid: () => ({}),
    },
    header: (name: string, value: string) => {
      responseHeaders[name.toLowerCase()] = value;
    },
    json: (body: unknown) => body,
  };
  return { context: fake as unknown as TRouteContext, responseHeaders };
};

const rows = [{ id: 'a' }, { id: 'b' }];

describe('BaseRestController list responses', () => {
  test('respond with a range sets Content-Range, X-Response-Count, X-Response-Format and returns { count, data }', () => {
    const controller = new ItemsController();
    const { context, responseHeaders } = fakeContext();

    const body = controller.respond({
      context,
      format: ResponseFormats.ARRAY,
      payload: { count: rows.length, data: rows },
      range: { start: 0, end: 1, total: 10 },
    });

    expect(body).toEqual({ count: 2, data: rows });
    expect(responseHeaders[HTTP.Headers.CONTENT_RANGE]).toBe('records 0-1/10');
    expect(responseHeaders[HTTP.Headers.RESPONSE_COUNT_DATA]).toBe('2');
    expect(responseHeaders[HTTP.Headers.RESPONSE_FORMAT]).toBe(ResponseFormats.ARRAY);
  });

  test('an empty page reports records */total with count 0', () => {
    const controller = new ItemsController();
    const { context, responseHeaders } = fakeContext();

    const body = controller.respond({
      context,
      format: ResponseFormats.ARRAY,
      payload: { count: 0, data: [] },
      range: { start: 20, end: 20, total: 10 },
    });

    expect(body).toEqual({ count: 0, data: [] });
    expect(responseHeaders[HTTP.Headers.CONTENT_RANGE]).toBe('records */10');
    expect(responseHeaders[HTTP.Headers.RESPONSE_COUNT_DATA]).toBe('0');
  });

  test('x-request-count: false returns the bare array and keeps every header', () => {
    const controller = new ItemsController();
    const { context, responseHeaders } = fakeContext({
      requestHeaders: { [HTTP.Headers.REQUEST_COUNT_DATA]: 'false' },
    });

    const body = controller.respond({
      context,
      format: ResponseFormats.ARRAY,
      payload: { count: rows.length, data: rows },
      range: { start: 0, end: 1, total: 10 },
    });

    expect(body).toEqual(rows);
    expect(responseHeaders[HTTP.Headers.CONTENT_RANGE]).toBe('records 0-1/10');
    expect(responseHeaders[HTTP.Headers.RESPONSE_COUNT_DATA]).toBe('2');
    expect(responseHeaders[HTTP.Headers.RESPONSE_FORMAT]).toBe(ResponseFormats.ARRAY);
  });

  test('respond without a range writes no Content-Range and keeps the object format', () => {
    const controller = new ItemsController();
    const { context, responseHeaders } = fakeContext();

    const body = controller.respond({
      context,
      format: ResponseFormats.OBJECT,
      payload: { count: 1, data: rows[0] },
    });

    expect(body).toEqual({ count: 1, data: rows[0] });
    expect(responseHeaders[HTTP.Headers.CONTENT_RANGE]).toBeUndefined();
    expect(responseHeaders[HTTP.Headers.RESPONSE_FORMAT]).toBe(ResponseFormats.OBJECT);
    expect(responseHeaders[HTTP.Headers.RESPONSE_COUNT_DATA]).toBe('1');
  });

  test('setListHeaders writes the three list headers without touching the body', () => {
    const controller = new ItemsController();
    const { context, responseHeaders } = fakeContext();

    controller.setListHeaders({ context, range: { start: 3, end: 4, total: 7 }, count: 2 });

    expect(responseHeaders[HTTP.Headers.CONTENT_RANGE]).toBe('records 3-4/7');
    expect(responseHeaders[HTTP.Headers.RESPONSE_COUNT_DATA]).toBe('2');
    expect(responseHeaders[HTTP.Headers.RESPONSE_FORMAT]).toBe(ResponseFormats.ARRAY);
    expect(Object.keys(responseHeaders)).toHaveLength(3);
  });

  test('ResponseFormats is a closed set', () => {
    expect(ResponseFormats.isValid('array')).toBe(true);
    expect(ResponseFormats.isValid('object')).toBe(true);
    expect(ResponseFormats.isValid('list')).toBe(false);
  });
});

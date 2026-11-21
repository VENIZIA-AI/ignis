import { NativeFetcher } from '@/modules/network/http-request/fetcher/native-fetcher';
import { describe, expect, test } from 'bun:test';

describe('NativeFetcher.isRawBody', () => {
  test('what fetch takes as a body is raw', () => {
    const raw = [
      'text',
      new Uint8Array(2),
      new ArrayBuffer(2),
      new Blob(['x']),
      new FormData(),
      new URLSearchParams('a=1'),
      new ReadableStream(),
    ];

    expect(raw.map((body) => NativeFetcher.isRawBody(body))).toEqual(raw.map(() => true));
  });

  test('a plain object, an array, a number and undefined are not', () => {
    const encoded = [{ a: 1 }, [1], 1, undefined, null];

    expect(encoded.map((body) => NativeFetcher.isRawBody(body))).toEqual(encoded.map(() => false));
  });
});

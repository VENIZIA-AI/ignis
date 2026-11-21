import { HttpWire } from '@/http/common/wire';
import { describe, expect, test } from 'bun:test';

describe('HttpWire.toRequestBody', () => {
  test('a body fetch takes is sent as it is; FormData is flagged', () => {
    const form = new FormData();
    const stream = new ReadableStream();

    expect(HttpWire.toRequestBody({ body: 'text' })).toEqual({
      payload: 'text',
      isJson: false,
      isFormData: false,
    });
    expect(HttpWire.toRequestBody({ body: form })).toMatchObject({
      payload: form,
      isFormData: true,
    });
    expect(HttpWire.toRequestBody({ body: stream }).payload).toBe(stream);
  });

  test('a typed array is copied into a Blob, and any other object is JSON', async () => {
    const typed = HttpWire.toRequestBody({ body: new Uint8Array([1, 2]) });

    expect(typed.payload).toBeInstanceOf(Blob);
    const response = new Response(typed.payload);
    const result = await response.arrayBuffer();
    expect(result).toEqual(new Uint8Array([1, 2]).buffer);
    expect(HttpWire.toRequestBody({ body: { a: 1 } })).toEqual({
      payload: '{"a":1}',
      isJson: true,
      isFormData: false,
    });
  });
});

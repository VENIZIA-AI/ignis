import { HttpResponseReader } from '@/base/repositories/common/response-reader';
import { describe, expect, test } from 'bun:test';

const context = '[Client][read] 200 | /tickets';

const capture = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { statusCode: number; message: string };
  }

  throw new Error('expected the call to throw');
};

describe('HttpResponseReader.readText', () => {
  test('a body is its text', async () => {
    const text = await HttpResponseReader.readText({ response: new Response('plain') });

    expect(text).toBe('plain');
  });

  test('an empty body is an empty string', async () => {
    const text = await HttpResponseReader.readText({ response: new Response('') });

    expect(text).toBe('');
  });

  test('a 204 is an empty string', async () => {
    const response = new Response(null, { status: 204 });
    const text = await HttpResponseReader.readText({ response });

    expect(text).toBe('');
  });
});

describe('HttpResponseReader.readBody', () => {
  test('a JSON body is parsed', async () => {
    const response = new Response('{"id":1}', { headers: { 'content-type': 'application/json' } });
    const body = await HttpResponseReader.readBody({ response, context });

    expect(body).toEqual({ id: 1 });
  });

  test('an empty body is null, where response.json() would throw', async () => {
    const body = await HttpResponseReader.readBody({ response: new Response(''), context });

    expect(body).toBeNull();
  });

  test('a 204 is null', async () => {
    const response = new Response(null, { status: 204 });
    const body = await HttpResponseReader.readBody({ response, context });

    expect(body).toBeNull();
  });

  test('a body that is not JSON is a 502 that names the context and the size, never the content', async () => {
    const response = new Response('<html>secret</html>', {
      headers: { 'content-type': 'text/html' },
    });
    const error = await capture(() => HttpResponseReader.readBody({ response, context }));

    expect(error.statusCode).toBe(502);
    expect(error.message).toBe(
      `${context} | The response body is not JSON (19 chars, content-type: text/html)`,
    );
    expect(error.message).not.toContain('secret');
  });
});

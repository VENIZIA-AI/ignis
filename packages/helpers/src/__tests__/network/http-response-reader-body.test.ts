import { HttpResponseReader } from '@/modules/network/http-request/fetcher/common/response-reader';
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

const json = (text: string, type = 'application/json') =>
  new Response(text, { headers: { 'content-type': type } });

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

describe('HttpResponseReader.readBody reads a body by its content type', () => {
  test.each([
    'application/json',
    'application/json; charset=utf-8',
    'application/problem+json',
    'APPLICATION/JSON',
  ])('a %s body is parsed', async (type) => {
    const body = await HttpResponseReader.readBody({ response: json('{"id":1}', type), context });

    expect(body).toEqual({ id: 1 });
  });

  test('a JSON array, scalar and null are parsed as they are', async () => {
    const list = await HttpResponseReader.readBody({ response: json('[1,2]'), context });
    const scalar = await HttpResponseReader.readBody({ response: json('42'), context });
    const nothing = await HttpResponseReader.readBody({ response: json('null'), context });

    expect(list).toEqual([1, 2]);
    expect(scalar).toBe(42);
    expect(nothing).toBeNull();
  });

  test.each(['text/plain', 'text/csv; charset=utf-8', 'text/html'])(
    'a %s body is its text, never parsed',
    async (type) => {
      const body = await HttpResponseReader.readBody({ response: json('{"id":1}', type), context });

      expect(body).toBe('{"id":1}');
    },
  );

  test('a body with no content type is its text', async () => {
    const response = new Response(new TextEncoder().encode('{"id":1}'));
    const body = await HttpResponseReader.readBody({ response, context });

    expect(response.headers.has('content-type')).toBe(false);
    expect(body).toBe('{"id":1}');
  });

  test('an empty body is null, where response.json() would throw', async () => {
    const body = await HttpResponseReader.readBody({ response: json(''), context });

    expect(body).toBeNull();
  });

  test('a 204 is null', async () => {
    const response = new Response(null, { status: 204 });
    const body = await HttpResponseReader.readBody({ response, context });

    expect(body).toBeNull();
  });

  test('a body that claims JSON and is not is a 502 naming the context, the size and the type, never the content', async () => {
    const error = await capture(() =>
      HttpResponseReader.readBody({ response: json('{secret', 'Application/JSON'), context }),
    );

    expect(error.statusCode).toBe(502);
    expect(error.message).toBe(
      `${context} | The response body is not JSON (7 chars, content-type: Application/JSON)`,
    );
    expect(error.message).not.toContain('secret');
  });
});

describe('HttpResponseReader.readJson reads a body as JSON whatever its type says', () => {
  test('JSON under text/plain is parsed', async () => {
    const body = await HttpResponseReader.readJson({
      response: json('{"id":1}', 'text/plain'),
      context,
    });

    expect(body).toEqual({ id: 1 });
  });

  test('an empty body and a 204 are null', async () => {
    const empty = await HttpResponseReader.readJson({ response: new Response(''), context });
    const noContent = await HttpResponseReader.readJson({
      response: new Response(null, { status: 204 }),
      context,
    });

    expect(empty).toBeNull();
    expect(noContent).toBeNull();
  });

  test('text that is not JSON is a 502 that names the context, the size and the type', async () => {
    const response = json('<html>secret</html>', 'text/html');
    const error = await capture(() => HttpResponseReader.readJson({ response, context }));

    expect(error.statusCode).toBe(502);
    expect(error.message).toBe(
      `${context} | The response body is not JSON (19 chars, content-type: text/html)`,
    );
    expect(error.message).not.toContain('secret');
  });

  test('a response with no content type says none', async () => {
    const response = new Response(new TextEncoder().encode('{oops'));
    const error = await capture(() => HttpResponseReader.readJson({ response, context }));

    expect(error.message).toContain('content-type: none');
  });
});

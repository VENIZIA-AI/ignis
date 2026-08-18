import { describe, expect, test } from 'bun:test';
import { BffEnvelope } from '@/envelope/encode';

describe('envelope round-trip', () => {
  test('a Request survives encode then decode', async () => {
    const original = new Request('http://ignis.internal/orders?limit=20', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-trace': 'abc' },
      body: JSON.stringify({ note: 'hello' }),
    });

    const envelope = await BffEnvelope.encodeRequest({ request: original, id: 'req-1' });
    const rebuilt = BffEnvelope.decodeRequest({ envelope });

    expect(rebuilt.method).toBe('POST');
    expect(rebuilt.url).toBe('http://ignis.internal/orders?limit=20');
    expect(rebuilt.headers.get('x-trace')).toBe('abc');
    expect(await rebuilt.json()).toEqual({ note: 'hello' });
  });

  test('the envelope is structured-cloneable, which a Request is not', async () => {
    const request = new Request('http://ignis.internal/orders', { method: 'GET' });

    expect(() => structuredClone(request)).toThrow();

    const envelope = await BffEnvelope.encodeRequest({ request, id: 'req-2' });
    expect(() => structuredClone(envelope)).not.toThrow();
  });

  test('a Response round-trips with its status and headers', async () => {
    const original = new Response(JSON.stringify([{ id: 1 }]), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });

    const envelope = await BffEnvelope.encodeResponse({ response: original, id: 'req-3' });
    const rebuilt = BffEnvelope.decodeResponse({ envelope });

    expect(rebuilt.status).toBe(201);
    expect(rebuilt.headers.get('content-type')).toBe('application/json');
    expect(await rebuilt.json()).toEqual([{ id: 1 }]);
  });

  test('a body is carried as an ArrayBuffer, never a stream', async () => {
    const envelope = await BffEnvelope.encodeResponse({
      response: new Response('plain text', { status: 200 }),
      id: 'req-4',
    });

    expect(envelope.body).toBeInstanceOf(ArrayBuffer);
  });

  test('a 204 response has no body, and decoding it back does not throw', async () => {
    const original = new Response(null, { status: 204 });

    const envelope = await BffEnvelope.encodeResponse({ response: original, id: 'req-5' });
    expect(envelope.body).toBeUndefined();

    const rebuilt = BffEnvelope.decodeResponse({ envelope });
    expect(rebuilt.status).toBe(204);
    expect(rebuilt.body).toBeNull();
  });

  test('a 304 response has no body, and decoding it back does not throw', async () => {
    const original = new Response(null, { status: 304 });

    const envelope = await BffEnvelope.encodeResponse({ response: original, id: 'req-6' });
    expect(envelope.body).toBeUndefined();

    const rebuilt = BffEnvelope.decodeResponse({ envelope });
    expect(rebuilt.status).toBe(304);
    expect(rebuilt.body).toBeNull();
  });
});

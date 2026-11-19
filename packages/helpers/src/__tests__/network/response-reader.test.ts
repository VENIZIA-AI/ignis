import { describe, expect, test } from 'bun:test';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { z } from 'zod';
import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import { BodyLimit } from '@/modules/network/http-request/fetcher/common/body-limit';
import { FetchSchemaError } from '@/modules/network/http-request/fetcher/common/errors';
import { ResponseReader } from '@/modules/network/http-request/fetcher/common/response-reader';
import { FetchHeaders } from '@/modules/network/http-request/fetcher/common/utilities';
import { NativeFetcher } from '@/modules/network/http-request/fetcher/native-fetcher';
import {
  UrlSafetyErrors,
  UrlSafetyRefusals,
} from '@/modules/network/utilities/url-safety/common/errors';
import { UrlPolicy } from '@/modules/network/utilities/url-safety/policy';

describe('ResponseReader.readText', () => {
  test('a 204, an empty body and no body are the empty string, capped or not', async () => {
    const noContent = new Response(null, { status: HTTP.ResultCodes.RS_2.NoContent });

    const result = await ResponseReader.readText({ response: noContent });
    expect(result).toBe('');
    const result2 = await ResponseReader.readText({ response: new Response(''), maxBytes: 10 });
    expect(result2).toBe('');
    const result3 = await ResponseReader.readText({ response: new Response(null), maxBytes: 10 });
    expect(result3).toBe('');
  });

  test('the text is read whole, or up to the cap', async () => {
    const result4 = await ResponseReader.readText({ response: new Response('héllo') });
    expect(result4).toBe('héllo');
    const result5 = await ResponseReader.readText({ response: new Response('hello'), maxBytes: 5 });
    expect(result5).toBe('hello');
  });

  test('a body over the cap fails, as BodyLimit does', async () => {
    const error = await RejectionHelper.rejectionOf({
      task: ResponseReader.readText({ response: new Response('x'.repeat(50)), maxBytes: 10 }),
    });

    expect((error as Error).message).toContain('Body exceeds the cap');
  });
});

describe('an empty body with a schema is still a FetchSchemaError, capped or not', () => {
  test('uncapped and capped', async () => {
    const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response(null) });
    const url = `http://127.0.0.1:${server.port}/`;
    const fetcher = new NativeFetcher({ name: 'n' });

    try {
      const uncapped = await RejectionHelper.rejectionOf({
        task: fetcher.get({ url, schema: z.object({}) }),
      });
      const capped = await RejectionHelper.rejectionOf({
        task: fetcher.get({ url, schema: z.object({}), maxBytes: 1000 }),
      });

      expect(FetchSchemaError.is(uncapped)).toBe(true);
      expect(FetchSchemaError.is(capped)).toBe(true);
    } finally {
      await server.stop(true);
    }
  });
});

describe('FetchHeaders.withJsonDefault', () => {
  test('is the JSON content type under the layers: replaced in any case, or removed with null', () => {
    expect(FetchHeaders.withJsonDefault({ layers: [] }).get(HTTP.Headers.CONTENT_TYPE)).toBe(
      HTTP.HeaderValues.APPLICATION_JSON_UTF8,
    );
    expect(
      FetchHeaders.withJsonDefault({ layers: [{ 'Content-Type': 'text/plain' }] }).get(
        'content-type',
      ),
    ).toBe('text/plain');
    expect(
      FetchHeaders.withJsonDefault({ layers: [{ 'content-type': null }] }).has('content-type'),
    ).toBe(false);
  });
});

describe('one refusal test', () => {
  test('UrlSafetyRefusals.is and UrlPolicy.isRefusedError agree: the guard error, and nothing else', () => {
    const refusal = getError({ error: UrlSafetyErrors.URL_REFUSED, message: 'no' });

    expect(UrlSafetyRefusals.is({ error: refusal })).toBe(true);
    expect(UrlPolicy.isRefusedError({ error: refusal })).toBe(true);

    for (const other of [new Error('x'), getError({ message: 'other' }), undefined, 'text']) {
      expect(UrlSafetyRefusals.is({ error: other })).toBe(false);
      expect(UrlPolicy.isRefusedError({ error: other })).toBe(false);
    }
  });
});

describe('one refusal for a body over the cap', () => {
  test('a stream, a read and the guard error share one message form and the guard code', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(50));
        controller.close();
      },
    });
    const streamed = new Response(BodyLimit.capStream({ source, maxBytes: 10 }));
    const streamError = await RejectionHelper.rejectionOf({ task: streamed.text() });
    const readError = await RejectionHelper.rejectionOf({
      task: BodyLimit.readBytes({ response: new Response('x'.repeat(50)), maxBytes: 10 }),
    });

    for (const error of [
      streamError,
      readError,
      BodyLimit.refuse({ detail: 'declared: 50 | max: 10' }),
    ]) {
      expect((error as Error).message).toContain('[fetch] Body exceeds the cap |');
      expect(UrlSafetyRefusals.is({ error })).toBe(true);
    }
  });
});

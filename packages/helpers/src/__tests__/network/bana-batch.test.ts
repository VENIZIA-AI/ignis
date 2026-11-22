/** The fixes of the BANA migration batch: body cap code, refused axios fields at run time, filenames, header layers, FormData. */

import { afterAll, describe, expect, test } from 'bun:test';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { z } from 'zod';
import { BodyLimit } from '@/modules/network/http-request/fetcher/common/body-limit';
import { HttpBodies, HttpHeaders } from '@/modules/network/http-request/fetcher/common/utilities';
import { HttpResponseReader } from '@/modules/network/http-request/fetcher/common/response-reader';
import {
  AxiosFetcher,
  AxiosNetworkRequest,
} from '@/modules/network/http-request/fetcher/axios-fetcher';
import {
  NativeFetcher,
  NativeFetchNetworkRequest,
} from '@/modules/network/http-request/fetcher/native-fetcher';
import {
  UrlSafetyErrors,
  UrlSafetyRefusals,
} from '@/modules/network/utilities/url-safety/common/errors';
import { getError } from '@/modules/error';

const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: async (request) => {
    const { pathname } = new URL(request.url);

    if (pathname === '/big') {
      return new Response('x'.repeat(5000));
    }

    const text = await request.text();

    return Response.json({ contentType: request.headers.get('content-type'), size: text.length });
  },
});

afterAll(async () => {
  await server.stop(true);
});

const origin = `http://127.0.0.1:${server.port}`;
const Echo = z.object({ contentType: z.string().nullable(), size: z.number() });

describe('a body over the cap has a code of its own', () => {
  test('BodyLimit.refuse answers body_too_large, which is not the refused-address code', () => {
    const error = BodyLimit.refuse({ detail: 'received: 9 | max: 5' });

    expect(UrlSafetyRefusals.isBodyTooLarge({ error })).toBe(true);
    expect(UrlSafetyRefusals.is({ error })).toBe(true);
    expect(error.normalized.code).toBe(UrlSafetyErrors.BODY_TOO_LARGE.message.code);
    expect(error.normalized.code).not.toBe(UrlSafetyErrors.URL_REFUSED.message.code);
  });

  test('a refused address is not a body over the cap', () => {
    const error = getError({ error: UrlSafetyErrors.URL_REFUSED, message: '[fetch] refused' });

    expect(UrlSafetyRefusals.isBodyTooLarge({ error })).toBe(false);
    expect(UrlSafetyRefusals.is({ error })).toBe(true);
  });

  test('both fetchers refuse an oversized answer with it', async () => {
    const axios = new AxiosFetcher({ name: 'a', defaultConfigs: {} });
    const native = new NativeFetcher({ name: 'n' });

    const fromAxios = await RejectionUtility.rejectionOf({
      task: axios.get({ url: `${origin}/big`, maxBytes: 100 }),
    });
    const fromNative = await RejectionUtility.rejectionOf({
      task: native.get({ url: `${origin}/big`, maxBytes: 100 }),
    });

    expect(UrlSafetyRefusals.isBodyTooLarge({ error: fromAxios })).toBe(true);
    expect(UrlSafetyRefusals.isBodyTooLarge({ error: fromNative })).toBe(true);
  });
});

describe('an axios field the pipeline drops is refused at run time too', () => {
  test('data, validateStatus, paramsSerializer, baseURL and allowAbsoluteUrls on an untyped call', async () => {
    const fetcher = new AxiosFetcher({ name: 'a', defaultConfigs: {} });
    const refused: Array<[string, string]> = [
      ['data', "pass the body as 'body'"],
      ['validateStatus', "use 'acceptStatus'"],
      ['paramsSerializer', "custom query string into 'url'"],
      ['baseURL', "'baseUrl'"],
      ['allowAbsoluteUrls', 'one absolute url'],
    ];

    for (const [field, instead] of refused) {
      const extra: Record<string, unknown> = { [field]: field === 'data' ? { a: 1 } : () => true };

      await RejectionUtility.expectRejection({
        task: fetcher.post({ url: `${origin}/echo`, ...extra }),
        message: `'${field}' is not an option of a call`,
      });
      await RejectionUtility.expectRejection({
        task: fetcher.post({ url: `${origin}/echo`, ...extra }),
        message: instead.includes("'") ? (instead.split("'")[1] ?? instead) : instead,
      });
    }
  });
});

describe('HttpResponseReader.parseContentDisposition', () => {
  test('an empty name is no name, in every form', () => {
    for (const header of [
      "attachment; filename*=UTF-8''",
      'attachment; filename=""',
      'attachment; filename=',
      'attachment; filename=;',
    ]) {
      expect(HttpResponseReader.parseContentDisposition({ header }).filename).toBeUndefined();
    }
  });

  test('an empty filename* reads as absent: the plain filename is the answer', () => {
    const { filename } = HttpResponseReader.parseContentDisposition({
      header: 'attachment; filename="plain.txt"; filename*=UTF-8\'\'',
    });

    expect(filename).toBe('plain.txt');
  });

  test('ISO-8859-1 is decoded as latin1', () => {
    const { filename } = HttpResponseReader.parseContentDisposition({
      header: "attachment; filename*=ISO-8859-1''caf%E9.txt",
    });

    expect(filename).toBe('café.txt');
  });

  test('UTF-8 still decodes, and another charset falls through to the plain filename', () => {
    const utf8 = HttpResponseReader.parseContentDisposition({
      header: "attachment; filename*=UTF-8''Ki%E1%BB%83m.txt",
    });
    const other = HttpResponseReader.parseContentDisposition({
      header: 'attachment; filename="plain.txt"; filename*=windows-1252\'\'caf%E9.txt',
    });

    expect(utf8.filename).toBe('Kiểm.txt');
    expect(other.filename).toBe('plain.txt');
  });
});

describe('HttpBodies.isAnyOf', () => {
  test('a body of another realm or a polyfill is found by its tag', () => {
    const foreign = { [Symbol.toStringTag]: 'FormData' };

    expect(HttpBodies.isAnyOf({ body: foreign, names: ['FormData'] })).toBe(true);
    expect(HttpBodies.isAnyOf({ body: foreign, names: ['Blob'] })).toBe(false);
    expect(HttpBodies.isAnyOf({ body: 'text', names: ['Blob'] })).toBe(false);
    expect(HttpBodies.isAnyOf({ body: new FormData(), names: ['FormData'] })).toBe(true);
  });
});

describe('HttpHeaders.merge', () => {
  test('a null or undefined layer is skipped, as it was before', () => {
    const merged = HttpHeaders.merge({ layers: [null, { a: '1' }, undefined, null, { b: '2' }] });

    expect(Object.fromEntries(merged)).toEqual({ a: '1', b: '2' });
  });
});

type TUploadCall = {
  body: FormData | URLSearchParams | Blob | Record<string, unknown>;
  headers?: Record<string, string>;
};

/** One poster per fetcher, each sending `call` to the echo route through a client built with a baseUrl (so with the JSON default content type). */
const posters: Array<(call: TUploadCall) => Promise<{ data: z.infer<typeof Echo> }>> = [
  (call) =>
    new AxiosNetworkRequest({ name: 'a', networkOptions: { baseUrl: origin } })
      .getNetworkService()
      .post({ url: '/echo', ...call, schema: Echo }),
  (call) =>
    new NativeFetchNetworkRequest({ name: 'n', networkOptions: { baseUrl: origin } })
      .getNetworkService()
      .post({ url: '/echo', ...call, schema: Echo }),
];

describe('a FormData, URLSearchParams or Blob body under the JSON default content type', () => {
  test('the JSON default is dropped, so the runtime writes the multipart boundary', async () => {
    const form = new FormData();
    form.append('field', 'value');

    for (const post of posters) {
      const { data } = await post({ body: form });

      expect(data.contentType).toStartWith('multipart/form-data; boundary=');
    }
  });

  test('a URLSearchParams body is sent as a form, not as JSON text', async () => {
    for (const post of posters) {
      const { data } = await post({ body: new URLSearchParams({ a: '1' }) });

      expect(data.contentType).toStartWith('application/x-www-form-urlencoded');
    }
  });

  test('a content type the call names wins', async () => {
    for (const post of posters) {
      const { data } = await post({
        body: new URLSearchParams({ a: '1' }),
        headers: { 'content-type': 'text/x-custom' },
      });

      expect(data.contentType).toBe('text/x-custom');
    }
  });

  test('a plain object body keeps the JSON default', async () => {
    for (const post of posters) {
      const { data } = await post({ body: { a: 1 } });

      expect(data.contentType).toBe('application/json; charset=utf-8');
    }
  });
});

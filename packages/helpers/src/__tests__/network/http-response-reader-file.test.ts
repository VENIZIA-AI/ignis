import { HttpResponseReader } from '@/modules/network/http-request/fetcher/common/response-reader';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { describe, expect, test } from 'bun:test';

describe('HttpResponseReader.readFile', () => {
  test('a 200 gives the blob, the type and the filename, `filename*` first', async () => {
    const response = new Response('abc', {
      headers: {
        'content-type': 'text/csv',
        'content-disposition': `attachment; filename="plain.csv"; filename*=UTF-8''t%E1%BB%87p.csv`,
      },
    });

    const file = await HttpResponseReader.readFile({ response });

    const result = await file.blob.text();
    expect(result).toBe('abc');
    expect(file.contentType).toBe('text/csv');
    expect(file.filename).toBe('tệp.csv');
  });

  test('a 200 without Content-Disposition has no filename', async () => {
    const file = await HttpResponseReader.readFile({
      response: new Response('x', { headers: { 'content-type': 'application/pdf' } }),
    });

    expect(file.filename).toBeUndefined();
    expect(file.contentType).toBe('application/pdf');
  });

  test("a 4xx throws the server's error, its text as the message", async () => {
    const response = new Response(JSON.stringify({ normalized: { text: 'No such file' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });

    const failure = await RejectionHelper.rejectionOf({
      task: HttpResponseReader.readFile({ response }),
    });

    expect(failure).toMatchObject({ statusCode: 404, message: 'No such file' });
  });
});

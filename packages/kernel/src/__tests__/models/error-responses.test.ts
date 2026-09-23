import { htmlResponse } from '@/base/controllers/common/html-response';
import { ErrorSchema, errorResponses, jsonResponse } from '@/base/models/common/schemas';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { describe, expect, test } from 'bun:test';

type TRouteResponses = Parameters<typeof createRoute>[0]['responses'];

const ERROR_REFERENCE = { $ref: '#/components/schemas/ErrorResponse' };

/** OpenAPI accepts only `default` and the range keys `1XX`-`5XX` beside explicit codes; any other key makes a client generator type the error as `never`. */
const toDocument = (opts: { routes: Record<string, TRouteResponses> }) => {
  const application = new OpenAPIHono();

  for (const [path, responses] of Object.entries(opts.routes)) {
    application.openapi(createRoute({ method: 'get', path, responses }), context =>
      context.text('ok'),
    );
  }

  return application.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'error-responses-probe', version: '1' },
  });
};

const toResponses = (opts: { responses: TRouteResponses }) => {
  const document = toDocument({ routes: { '/probe': opts.responses } });
  return document.paths?.['/probe']?.get?.responses ?? {};
};

describe('error responses use the OpenAPI range keys', () => {
  test('errorResponses declares ErrorSchema under exactly 4XX and 5XX', () => {
    const responses = errorResponses();

    expect(Object.keys(responses).sort()).toEqual(['4XX', '5XX']);
    for (const response of Object.values(responses)) {
      expect(response.description).toBe('Error Response');
      expect(response.content['application/json'].schema).toBe(ErrorSchema);
    }
  });

  test('jsonResponse declares the error body under 4XX and 5XX', () => {
    const responses = toResponses({
      responses: jsonResponse({ schema: z.object({ id: z.string() }) }),
    });

    expect(Object.keys(responses).sort()).toEqual(['200', '4XX', '5XX']);
    for (const key of ['4XX', '5XX']) {
      expect(responses[key]).toMatchObject({
        description: 'Error Response',
        content: { 'application/json': { schema: ERROR_REFERENCE } },
      });
    }
  });

  test('htmlResponse declares the json error body under 4XX and 5XX', () => {
    const responses = toResponses({ responses: htmlResponse({ description: 'A page' }) });

    expect(Object.keys(responses).sort()).toEqual(['200', '4XX', '5XX']);
    for (const key of ['4XX', '5XX']) {
      expect(responses[key]).toMatchObject({
        description: 'Error Response',
        content: { 'application/json': { schema: ERROR_REFERENCE } },
      });
    }
  });
});

describe('ErrorSchema is one named component', () => {
  test('every route references ErrorResponse, and the document declares it once', () => {
    const document = toDocument({
      routes: {
        '/json': jsonResponse({ schema: z.object({ id: z.string() }) }),
        '/html': htmlResponse({ description: 'A page' }),
      },
    });

    for (const path of ['/json', '/html']) {
      const responses = document.paths?.[path]?.get?.responses ?? {};
      expect(responses['4XX']).toMatchObject({
        content: { 'application/json': { schema: ERROR_REFERENCE } },
      });
      expect(responses['5XX']).toMatchObject({
        content: { 'application/json': { schema: ERROR_REFERENCE } },
      });
    }

    expect(Object.keys(document.components?.schemas ?? {})).toEqual(['ErrorResponse']);
    expect(document.components?.schemas?.ErrorResponse).toMatchObject({
      type: 'object',
      required: ['message'],
      description: 'Error Schema',
    });
  });
});

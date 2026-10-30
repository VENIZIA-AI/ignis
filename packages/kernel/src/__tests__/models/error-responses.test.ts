import { htmlContent, htmlResponse } from '@/base/controllers/common/html-response';
import { requiredString } from '@/base/controllers/common/schema-builders';
import {
  ErrorSchema,
  errorResponses,
  idParamsSchema,
  jsonContent,
  jsonResponse,
  OpenApiResponses,
  OpenApiSchemas,
} from '@/base/models/common/schemas';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { describe, expect, test } from 'bun:test';

type TRouteResponses = Parameters<typeof createRoute>[0]['responses'];

const ERROR_REFERENCE = { $ref: '#/components/schemas/ErrorResponse' };

/** OpenAPI accepts only `default` and the range keys `1XX`-`5XX` beside explicit codes; any other key makes a client generator type the error as `never`. */
const toDocument = (opts: { routes: Record<string, TRouteResponses> }) => {
  const application = new OpenAPIHono();

  for (const [path, responses] of Object.entries(opts.routes)) {
    application.openapi(createRoute({ method: 'get', path, responses }), (context) =>
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
  test('OpenApiResponses.errorResponses declares ErrorSchema under exactly 4XX and 5XX', () => {
    const responses = OpenApiResponses.errorResponses();

    expect(Object.keys(responses).sort()).toEqual(['4XX', '5XX']);
    for (const response of Object.values(responses)) {
      expect(response.description).toBe('Error Response');
      expect(response.content['application/json'].schema).toBe(ErrorSchema);
    }
  });

  test('OpenApiResponses.jsonResponse declares the error body under 4XX and 5XX', () => {
    const responses = toResponses({
      responses: OpenApiResponses.jsonResponse({ schema: z.object({ id: z.string() }) }),
    });

    expect(Object.keys(responses).sort()).toEqual(['200', '4XX', '5XX']);
    for (const key of ['4XX', '5XX']) {
      expect(responses[key]).toMatchObject({
        description: 'Error Response',
        content: { 'application/json': { schema: ERROR_REFERENCE } },
      });
    }
  });

  test('OpenApiResponses.htmlResponse declares the json error body under 4XX and 5XX', () => {
    const responses = toResponses({
      responses: OpenApiResponses.htmlResponse({ description: 'A page' }),
    });

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
        '/json': OpenApiResponses.jsonResponse({ schema: z.object({ id: z.string() }) }),
        '/html': OpenApiResponses.htmlResponse({ description: 'A page' }),
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

describe('the deprecated response and schema functions answer as the classes do', () => {
  const schema = z.object({ id: z.string() });

  test('jsonContent, errorResponses, jsonResponse', () => {
    const opts = { schema, description: 'Body', required: true };

    expect(jsonContent(opts)).toEqual(OpenApiResponses.jsonContent(opts));
    expect(errorResponses()).toEqual(OpenApiResponses.errorResponses());
    expect(jsonResponse({ schema, description: 'Done' })).toEqual(
      OpenApiResponses.jsonResponse({ schema, description: 'Done' }),
    );
    expect(
      jsonResponse({ schema, headers: { 'x-trace': { schema: { type: 'string' } } } }),
    ).toEqual(
      OpenApiResponses.jsonResponse({
        schema,
        headers: { 'x-trace': { schema: { type: 'string' } } },
      }),
    );
  });

  /** Each call builds a fresh zod schema, which `toEqual` cannot compare; the schema's own JSON Schema can be. */
  const toHtmlProbe = (content: ReturnType<typeof OpenApiResponses.htmlContent>) => {
    return {
      description: content.description,
      required: content.required,
      html: z.toJSONSchema(content.content['text/html'].schema),
    };
  };

  test('htmlContent, htmlResponse', () => {
    expect(toHtmlProbe(htmlContent({ description: 'A page' }))).toEqual(
      toHtmlProbe(OpenApiResponses.htmlContent({ description: 'A page' })),
    );
    expect(htmlContent({ description: 'A page' }).required).toBe(false);

    const old = htmlResponse({ description: 'A page', required: true });
    const next = OpenApiResponses.htmlResponse({ description: 'A page', required: true });
    expect(Object.keys(old).sort()).toEqual(Object.keys(next).sort());
    expect(toHtmlProbe(old[200])).toEqual(toHtmlProbe(next[200]));
  });

  test('idParamsSchema, requiredString', () => {
    expect(Object.keys(idParamsSchema({ idType: 'string' }).shape)).toEqual(['id']);
    expect(idParamsSchema().safeParse({ id: 7 }).success).toBe(
      OpenApiSchemas.idParams().safeParse({ id: 7 }).success,
    );
    expect(idParamsSchema({ idType: 'string' }).safeParse({ id: 7 }).success).toBe(
      OpenApiSchemas.idParams({ idType: 'string' }).safeParse({ id: 7 }).success,
    );

    for (const opts of [undefined, { min: 3 }, { max: 2 }, { fixed: 4 }]) {
      for (const input of ['', 'ab', 'abcd', 'abcdef']) {
        expect(requiredString(opts).safeParse(input).success).toBe(
          OpenApiSchemas.requiredString(opts).safeParse(input).success,
        );
      }
    }
  });
});

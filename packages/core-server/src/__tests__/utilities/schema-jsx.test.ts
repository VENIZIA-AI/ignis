import { describe, expect, test } from 'bun:test';
import { AnyObjectSchema, OpenApiResponses, OpenApiSchemas } from '@/utilities';
import { HTTP, type AnyType } from '@venizia/ignis-helpers/common';

describe('OpenApiSchemas.requiredString', () => {
  test('rejects an empty string with no options at all', () => {
    const schema = OpenApiSchemas.requiredString();

    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse('a').success).toBe(true);
  });

  test('min and max are enforced', () => {
    const schema = OpenApiSchemas.requiredString({ min: 3, max: 5 });

    expect(schema.safeParse('ab').success).toBe(false);
    expect(schema.safeParse('abc').success).toBe(true);
    expect(schema.safeParse('abcdef').success).toBe(false);
  });

  test('fixed pins an exact length', () => {
    const schema = OpenApiSchemas.requiredString({ fixed: 6 });

    expect(schema.safeParse('123456').success).toBe(true);
    expect(schema.safeParse('12345').success).toBe(false);
    expect(schema.safeParse('1234567').success).toBe(false);
  });

  test('a non-string is rejected', () => {
    expect(OpenApiSchemas.requiredString().safeParse(42).success).toBe(false);
  });
});

describe('AnyObjectSchema', () => {
  test('accepts any object shape and rejects a non-object', () => {
    expect(AnyObjectSchema.safeParse({ a: 1, b: { c: 2 } }).success).toBe(true);
    expect(AnyObjectSchema.safeParse('nope').success).toBe(false);
  });
});

describe('OpenApiResponses.htmlContent / htmlResponse', () => {
  test('OpenApiResponses.htmlContent declares text/html and defaults required to false', () => {
    const content = OpenApiResponses.htmlContent({ description: 'A page' });

    expect(content.description).toBe('A page');
    expect(content.required).toBe(false);
    expect(content.content['text/html'].schema.safeParse('<p>x</p>').success).toBe(true);
  });

  test('OpenApiResponses.htmlContent honours an explicit required flag', () => {
    expect(OpenApiResponses.htmlContent({ description: 'A page', required: true }).required).toBe(
      true,
    );
  });

  test('OpenApiResponses.htmlResponse pairs the OK html body with a json error body', () => {
    const response = OpenApiResponses.htmlResponse({ description: 'A page' }) as AnyType;

    const okResponse = response[HTTP.ResultCodes.RS_2.Ok];
    expect(okResponse.description).toBe('A page');
    expect(okResponse.content['text/html']).toBeDefined();

    expect(response['4XX'].content['application/json'].schema).toBeDefined();
    expect(response['5XX'].content['application/json'].schema).toBeDefined();
    expect(response['4xx | 5xx']).toBeUndefined();
  });
});

import { describe, expect, test } from 'bun:test';
import { AnyObjectSchema, htmlContent, htmlResponse, requiredString } from '@/utilities';
import { HTTP, type AnyType } from '@venizia/ignis-helpers/common';

describe('requiredString', () => {
  test('rejects an empty string with no options at all', () => {
    const schema = requiredString();

    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse('a').success).toBe(true);
  });

  test('min and max are enforced', () => {
    const schema = requiredString({ min: 3, max: 5 });

    expect(schema.safeParse('ab').success).toBe(false);
    expect(schema.safeParse('abc').success).toBe(true);
    expect(schema.safeParse('abcdef').success).toBe(false);
  });

  test('fixed pins an exact length', () => {
    const schema = requiredString({ fixed: 6 });

    expect(schema.safeParse('123456').success).toBe(true);
    expect(schema.safeParse('12345').success).toBe(false);
    expect(schema.safeParse('1234567').success).toBe(false);
  });

  test('a non-string is rejected', () => {
    expect(requiredString().safeParse(42).success).toBe(false);
  });
});

describe('AnyObjectSchema', () => {
  test('accepts any object shape and rejects a non-object', () => {
    expect(AnyObjectSchema.safeParse({ a: 1, b: { c: 2 } }).success).toBe(true);
    expect(AnyObjectSchema.safeParse('nope').success).toBe(false);
  });
});

describe('htmlContent / htmlResponse', () => {
  test('htmlContent declares text/html and defaults required to false', () => {
    const content = htmlContent({ description: 'A page' });

    expect(content.description).toBe('A page');
    expect(content.required).toBe(false);
    expect(content.content['text/html'].schema.safeParse('<p>x</p>').success).toBe(true);
  });

  test('htmlContent honours an explicit required flag', () => {
    expect(htmlContent({ description: 'A page', required: true }).required).toBe(true);
  });

  test('htmlResponse pairs the OK html body with a json error body', () => {
    const response = htmlResponse({ description: 'A page' }) as AnyType;

    const okResponse = response[HTTP.ResultCodes.RS_2.Ok];
    expect(okResponse.description).toBe('A page');
    expect(okResponse.content['text/html']).toBeDefined();

    expect(response['4xx | 5xx'].content['application/json'].schema).toBeDefined();
  });
});

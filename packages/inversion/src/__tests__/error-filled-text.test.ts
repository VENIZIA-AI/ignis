import { describe, expect, test } from 'bun:test';
import { getError, isApplicationError, MessageTemplate } from '@/modules/error';

describe('ApplicationError.toFilledText', () => {
  test('fills the args into the template, and leaves message and normalized.text as the template', () => {
    const error = getError({
      message: { text: 'Only %{available} left of %{sku}.', code: 'stock.unavailable' },
      messageArgs: { available: 2, sku: 'TRA-01' },
      statusCode: 409,
    });

    expect(error.toFilledText()).toBe('Only 2 left of TRA-01.');
    expect(error.message).toBe('Only %{available} left of %{sku}.');
    expect(error.normalized.text).toBe('Only %{available} left of %{sku}.');
  });

  test('a placeholder without an arg stays as written', () => {
    expect(getError({ message: 'Missing %{what}', statusCode: 400 }).toFilledText()).toBe(
      'Missing %{what}',
    );
  });

  test('a message with no placeholder comes back unchanged', () => {
    expect(getError({ message: 'Plain text', statusCode: 400 }).toFilledText()).toBe('Plain text');
  });
});

describe('MessageTemplate.render', () => {
  test('fills every occurrence of a key, and reports each missing key once', () => {
    expect(MessageTemplate.render({ text: '%{a}-%{a} %{b} %{b}', args: { a: 1 } })).toEqual({
      text: '1-1 %{b} %{b}',
      missing: ['b'],
    });
  });

  test('null and false are values; an inherited key is not an arg', () => {
    const args = Object.assign(Object.create({ inherited: 'no' }), { nil: null, off: false });
    expect(MessageTemplate.render({ text: '%{nil} %{off} %{inherited}', args })).toEqual({
      text: 'null false %{inherited}',
      missing: ['inherited'],
    });
  });

  test('args that are not an object fill nothing', () => {
    expect(MessageTemplate.render({ text: 'x %{a}', args: 'oops' })).toEqual({
      text: 'x %{a}',
      missing: ['a'],
    });
  });
});

describe('isApplicationError', () => {
  test('a plain Error that carries a statusCode is not one', () => {
    const httpError = Object.assign(new Error('Request failed'), { statusCode: 502 });
    expect(isApplicationError(httpError)).toBe(false);
  });

  test('an error with a statusCode and a malformed normalized is not one', () => {
    const malformed = Object.assign(new Error('x'), { statusCode: 400, normalized: { text: 1 } });
    expect(isApplicationError(malformed)).toBe(false);
  });

  test('an ApplicationError is one, and so is the same shape from another copy of the class', () => {
    expect(isApplicationError(getError({ message: 'x', statusCode: 400 }))).toBe(true);

    // What a CJS-built ApplicationError looks like to the ESM copy: same shape, another constructor.
    const otherCopy = Object.assign(new Error('x'), {
      statusCode: 409,
      normalized: { text: 'x', code: 'core.system_error', args: {} },
    });
    expect(isApplicationError(otherCopy)).toBe(true);
  });

  test('anything that is not an Error is not one', () => {
    expect(isApplicationError({ statusCode: 400, normalized: { text: 'x' } })).toBe(false);
    expect(isApplicationError(null)).toBe(false);
  });
});

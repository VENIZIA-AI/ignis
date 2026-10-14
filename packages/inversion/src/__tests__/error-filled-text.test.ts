import { describe, expect, test } from 'bun:test';
import { getError, MessageTemplate } from '@/modules/error';

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

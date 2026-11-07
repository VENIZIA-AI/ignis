import { describe, expect, test } from 'bun:test';
import { EchoUtility } from '@/utilities/echo.utility';

describe('EchoUtility.toSafeEcho', () => {
  test('a plain value is quoted and otherwise unchanged', () => {
    expect(EchoUtility.toSafeEcho({ value: 'photos/a.png' })).toBe('"photos/a.png"');
    expect(EchoUtility.toSafeEcho({ value: 'Báo cáo.xlsx' })).toBe('"Báo cáo.xlsx"');
  });

  test('a quote or a backslash cannot close the quoted token', () => {
    expect(EchoUtility.toSafeEcho({ value: 'a"b\\c' })).toBe('"a\\"b\\\\c"');
  });

  test.each([
    ['a line feed', '\n', '\\n'],
    ['a carriage return', '\r', '\\r'],
    ['an escape character', '\u001b', '\\u001b'],
    ['a null', '\u0000', '\\u0000'],
    ['a delete character', '\u007f', '\\u007f'],
    ['a next-line character', '\u0085', '\\u0085'],
    ['a line separator', '\u2028', '\\u2028'],
    ['a paragraph separator', '\u2029', '\\u2029'],
    ['a right-to-left override', '\u202e', '\\u202e'],
    ['an isolate', '\u2066', '\\u2066'],
    ['a zero-width space', '\u200b', '\\u200b'],
    ['a zero-width joiner', '\u200d', '\\u200d'],
    ['a word joiner', '\u2060', '\\u2060'],
    ['a byte order mark', '\ufeff', '\\ufeff'],
    ['a soft hyphen', '\u00ad', '\\u00ad'],
    ['an arabic letter mark', '\u061c', '\\u061c'],
    ['a tag character', '\u{e0041}', '\\u{e0041}'],
    ['a lone surrogate', '\ud800', '\\ud800'],
  ])('%s is escaped', (_name, character, escaped) => {
    const result = EchoUtility.toSafeEcho({ value: `a${character}b` });

    expect(result).toBe(`"a${escaped}b"`);
  });

  test('the result is one line made of printable characters only', () => {
    const everything = Array.from({ length: 0xa0 }, (_, code) => String.fromCharCode(code)).join(
      '',
    );
    const result = EchoUtility.toSafeEcho({ value: `${everything}\u2028\u202e\u200b` });

    expect(result).not.toMatch(/[\p{Cc}\u200b\u2028\u202e]/u);
  });

  test('an object is quoted as JSON and its strings are escaped too', () => {
    const result = EchoUtility.toSafeEcho({ value: { key: 'a\u202eb', size: 3 } });

    expect(result).toBe('{"key":"a\\u202eb","size":3}');
  });

  test('a value JSON cannot take is named by its type and never throws', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;

    expect(EchoUtility.toSafeEcho({ value: cycle })).toBe('<object>');
    expect(EchoUtility.toSafeEcho({ value: 10n })).toBe('<bigint>');
    expect(EchoUtility.toSafeEcho({ value: undefined })).toBe('<undefined>');
    expect(EchoUtility.toSafeEcho({ value: null })).toBe('null');
  });
});

describe('EchoUtility.toSafeText', () => {
  const at = (code: number): string => String.fromCharCode(code);

  test('an ordinary name is returned exactly as it came', () => {
    for (const value of ['assets', 'photos/a b.png', 'Báo cáo [Q3] & tổng hợp.xlsx', 'a"b\\c']) {
      expect(EchoUtility.toSafeText({ value })).toBe(value);
    }
  });

  test('every unsafe character is escaped, with no quotes added', () => {
    const value = `a${at(10)}b${at(0x1b)}c${at(0x202e)}d${at(0x200b)}e${at(0x2028)}f${at(0x7f)}g${at(0xd800)}h`;

    expect(EchoUtility.toSafeText({ value })).toBe(
      'a\\u000ab\\u001bc\\u202ed\\u200be\\u2028f\\u007fg\\ud800h',
    );
  });

  test('a valid surrogate pair stays, a tag character is escaped', () => {
    expect(EchoUtility.toSafeText({ value: 'a\u{1f600}b' })).toBe('a\u{1f600}b');
    expect(EchoUtility.toSafeText({ value: 'a\u{e0041}b' })).toBe('a\\u{e0041}b');
  });

  test('a value that is not a string is written as toSafeEcho writes it', () => {
    expect(EchoUtility.toSafeText({ value: undefined })).toBe('<undefined>');
    expect(EchoUtility.toSafeText({ value: { key: `a${at(0x202e)}` } })).toBe('{"key":"a\\u202e"}');
  });
});

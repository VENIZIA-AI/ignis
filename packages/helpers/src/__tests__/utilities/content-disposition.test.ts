/** `filename*` carries the real name; `filename` is the ASCII fallback. Both must be legal header text. */

import { describe, expect, test } from 'bun:test';
import {
  createContentDispositionHeader,
  parseContentDisposition,
} from '@/utilities/request.utility';

const toHeaderValue = (opts: { filename: string }): string =>
  createContentDispositionHeader({ filename: opts.filename, type: 'attachment' });

describe('createContentDispositionHeader', () => {
  test('a plain ASCII name is written exactly as before', () => {
    expect(toHeaderValue({ filename: 'report-2026 final.xlsx' })).toBe(
      `attachment; filename="report-2026 final.xlsx"; filename*=UTF-8''report-2026%20final.xlsx`,
    );
  });

  test('a Vietnamese name survives in filename*, with an ASCII fallback', () => {
    expect(toHeaderValue({ filename: 'Kiểm kê.xlsx' })).toBe(
      `attachment; filename="Ki_m k_.xlsx"; filename*=UTF-8''Ki%E1%BB%83m%20k%C3%AA.xlsx`,
    );
  });

  test.each(['Kiểm kê.xlsx', 'Báo cáo [Q3] & tổng hợp #1!.xlsx', '日本語.pdf'])(
    'the name reads back unchanged: %s',
    filename => {
      expect(parseContentDisposition({ header: toHeaderValue({ filename }) }).filename).toBe(
        filename,
      );
    },
  );

  test.each([
    ['a line break', 'bad\r\nSet-Cookie: x=1.txt'],
    ['a tab', 'tab\there.txt'],
    ['a line separator', 'line break.txt'],
    ['a lone surrogate', 'broken\uD800.txt'],
    ['a quote and a backslash', 'say "hi"\\now.txt'],
  ])('%s never reaches the header raw', (_label, filename) => {
    const value = toHeaderValue({ filename });

    expect(() => new Headers({ 'content-disposition': value })).not.toThrow();
    expect(value).toMatch(/^[\x20-\x7e]*$/);
    expect(value).not.toContain('\\');
    expect(value.match(/"/g)).toHaveLength(2);
  });

  test.each([
    ['right-to-left override', 'evil\u202Etxt.exe', 'evil_txt.exe'],
    ['left-to-right embedding', 'a\u202Ab.txt', 'a_b.txt'],
    ['right-to-left isolate', 'a\u2067b\u2069.txt', 'a_b_.txt'],
    ['zero-width space', 'a\u200Bb.txt', 'a_b.txt'],
  ])(
    'a %s is replaced in filename*, so no client renders a reordered name',
    (_label, filename, expected) => {
      const value = toHeaderValue({ filename });

      expect(value).toEndWith(`filename*=UTF-8''${expected}`);
      expect(parseContentDisposition({ header: value }).filename).not.toMatch(/\p{Cf}/u);
    },
  );

  test.each([
    ['an emoji joined by a zero-width joiner', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}.png'],
    [
      'a Persian word with a zero-width non-joiner',
      '\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645.txt',
    ],
  ])('%s reads back unchanged', (_label, filename) => {
    expect(parseContentDisposition({ header: toHeaderValue({ filename }) }).filename).toBe(
      filename,
    );
  });

  test('a path is reduced to its last segment in both forms', () => {
    expect(toHeaderValue({ filename: '../../etc/passwd' })).toBe(
      `attachment; filename="passwd"; filename*=UTF-8''passwd`,
    );
  });
});

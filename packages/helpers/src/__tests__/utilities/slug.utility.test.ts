import { describe, expect, test } from 'bun:test';
import { SlugUtility } from '@/utilities/slug.utility';

describe('SlugUtility.slugify', () => {
  test('transliterates đ/Đ to d, not dj - the whole point of this helper', () => {
    expect(SlugUtility.slugify({ value: 'Đường trắng' })).toBe('duong-trang');
    expect(SlugUtility.slugify({ value: 'Cà phê Đắk Lắk' })).toBe('ca-phe-dak-lak');
  });

  test('trims surrounding whitespace-turned-separators', () => {
    expect(SlugUtility.slugify({ value: '  Trà sữa  ' })).toBe('tra-sua');
  });

  test('keeps digits and collapses the space before them', () => {
    expect(SlugUtility.slugify({ value: 'Bột mì số 11' })).toBe('bot-mi-so-11');
  });

  test('an input with no usable characters returns the empty string', () => {
    expect(SlugUtility.slugify({ value: '!!!' })).toBe('');
  });

  test('an already-slugged string stays unchanged', () => {
    expect(SlugUtility.slugify({ value: 'already-slugged-123' })).toBe('already-slugged-123');
  });

  test('an empty input returns the empty string', () => {
    expect(SlugUtility.slugify({ value: '' })).toBe('');
  });

  test('a string of only diacritics with no base letters returns the empty string', () => {
    expect(SlugUtility.slugify({ value: '´`~^¨' })).toBe('');
  });

  test('mixed case collapses to lowercase', () => {
    expect(SlugUtility.slugify({ value: 'HeLLo WORLD' })).toBe('hello-world');
  });

  test('consecutive separators collapse to a single hyphen', () => {
    expect(SlugUtility.slugify({ value: 'foo   ---__  bar' })).toBe('foo-bar');
  });
});

/**
 * Marks left behind by NFD normalization. Written as escapes, not literal codepoints - a pasted
 * combining mark is invisible in editors and gets silently dropped by copy/paste.
 */
export const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;

/** Any run of characters outside the slug alphabet collapses to one hyphen. */
export const NON_SLUG_CHARACTERS_PATTERN = /[^a-z0-9]+/g;

export const LEADING_OR_TRAILING_HYPHENS_PATTERN = /^-+|-+$/g;

/**
 * `đ`/`Đ` carry no combining mark, so NFD leaves them intact - hence this explicit map. `d` is
 * deliberate: the `slugify` npm package romanizes them to `dj` (Serbo-Croatian), producing
 * `djuong-trang` for `Đường trắng`. Do not "fix" this to match that library.
 */
export const D_STROKE_REPLACEMENTS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /đ/g, replacement: 'd' },
  { pattern: /Đ/g, replacement: 'd' },
];

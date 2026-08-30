/** Strips Unicode combining marks left behind by NFD normalization (accents, tone marks, horns). */
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;

/** Any run of characters outside the slug alphabet collapses to one hyphen. */
const NON_SLUG_CHARACTERS_PATTERN = /[^a-z0-9]+/g;

const LEADING_OR_TRAILING_HYPHENS_PATTERN = /^-+|-+$/g;

/** Vietnamese-aware slugging. `đ`/`Đ` never decompose under NFD, so they need an explicit map to `d` - the default transliteration used by the `slugify` npm package maps them to `dj`, which does not match how Vietnamese product slugs are actually typed. */
export class SlugUtility {
  static slugify(opts: { value: string }): string {
    const { value } = opts;

    const withoutDiacritics = value.normalize('NFD').replace(COMBINING_MARKS_PATTERN, '');
    const withoutDStroke = withoutDiacritics.replace(/đ/g, 'd').replace(/Đ/g, 'd');
    const lowered = withoutDStroke.toLowerCase();
    const hyphenated = lowered.replace(NON_SLUG_CHARACTERS_PATTERN, '-');

    return hyphenated.replace(LEADING_OR_TRAILING_HYPHENS_PATTERN, '');
  }
}

import {
  COMBINING_MARKS_PATTERN,
  D_STROKE_REPLACEMENTS,
  LEADING_OR_TRAILING_HYPHENS_PATTERN,
  NON_SLUG_CHARACTERS_PATTERN,
} from './common/constants';
import { BaseHelper } from '@/modules/base';

/** Vietnamese-aware slugging. See `D_STROKE_REPLACEMENTS` for why `đ` maps to `d` and not `dj`. */
export class SlugHelper extends BaseHelper {
  static slugify(opts: { value: string }): string {
    const { value } = opts;

    const withoutDiacritics = value.normalize('NFD').replace(COMBINING_MARKS_PATTERN, '');

    const withoutDStroke = D_STROKE_REPLACEMENTS.reduce(
      (accumulated, { pattern, replacement }) => accumulated.replace(pattern, replacement),
      withoutDiacritics,
    );

    const hyphenated = withoutDStroke.toLowerCase().replace(NON_SLUG_CHARACTERS_PATTERN, '-');

    return hyphenated.replace(LEADING_OR_TRAILING_HYPHENS_PATTERN, '');
  }
}

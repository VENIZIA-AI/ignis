import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import type { ApplicationError } from '@venizia/ignis-helpers/core';
import { parseOrderEntry, Sorts } from '@venizia/ignis-filter';
import type { TParsedOrderEntry, TSortDirection } from '@venizia/ignis-filter';

/**
 * `parseOrderEntry` lives in `@venizia/ignis-filter`, which has no test runner of its own; it is
 * pinned here because every call site it replaces is in this package. The import resolves to the
 * filter package's `dist` - rebuild filter before trusting a run.
 */

const captureError = (task: () => unknown): ApplicationError => {
  try {
    task();
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the call to throw, but it returned normally');
};

const parse = (entry: string): TParsedOrderEntry => parseOrderEntry({ entry });

const FAST_PATH_SPELLINGS: Array<[string, TSortDirection]> = [
  ['name ASC', Sorts.ASC],
  ['name asc', Sorts.ASC],
  ['name DESC', Sorts.DESC],
  ['name desc', Sorts.DESC],
];

const MIXED_CASE_SPELLINGS: Array<[string, TSortDirection]> = [
  ['name Asc', Sorts.ASC],
  ['name aSC', Sorts.ASC],
  ['name Desc', Sorts.DESC],
  ['name dEsC', Sorts.DESC],
];

describe('parseOrderEntry - accepted forms', () => {
  test('a bare field defaults to ascending', () => {
    expect(parse('name')).toEqual({ field: 'name', direction: Sorts.ASC });
  });

  test.each(FAST_PATH_SPELLINGS)('the fast-path spelling %p parses', (entry, direction) => {
    expect(parse(entry)).toEqual({ field: 'name', direction });
  });

  test.each(MIXED_CASE_SPELLINGS)(
    'a mixed-case direction %p is accepted case-insensitively',
    (entry, direction) => {
      expect(parse(entry)).toEqual({ field: 'name', direction });
    },
  );

  test('a dotted JSON-path field keeps its dots', () => {
    expect(parse('metadata.rank DESC')).toEqual({ field: 'metadata.rank', direction: Sorts.DESC });
  });

  test('the field keeps its case; only the direction is normalized', () => {
    expect(parse('createdAt DESC')).toEqual({ field: 'createdAt', direction: Sorts.DESC });
  });
});

describe('parseOrderEntry - whitespace', () => {
  test.each([
    ['  name DESC', 'leading spaces'],
    ['name DESC  ', 'trailing spaces'],
    ['\tname DESC\t', 'leading and trailing tabs'],
    ['\n name DESC \n', 'leading and trailing newlines'],
    ['name    DESC', 'several spaces between tokens'],
    ['name\tDESC', 'a tab between tokens'],
    ['name \t DESC', 'mixed spaces and a tab between tokens'],
    ['name\vDESC', 'a vertical tab between tokens'],
    ['name\fDESC', 'a form feed between tokens'],
    ['name\rDESC', 'a carriage return between tokens'],
    ['name\r\nDESC', 'CRLF between tokens'],
  ])('%p (%s) parses to name/desc', entry => {
    expect(parse(entry)).toEqual({ field: 'name', direction: Sorts.DESC });
  });

  test.each([['  name'], ['name  '], ['\tname\t']])(
    'a bare field with surrounding whitespace %p defaults to ascending',
    entry => {
      expect(parse(entry)).toEqual({ field: 'name', direction: Sorts.ASC });
    },
  );
});

describe('parseOrderEntry - only ASCII whitespace separates tokens', () => {
  test.each([
    ['name\u00a0DESC', 'a non-breaking space'],
    ['name\u2003DESC', 'an em space'],
    ['name\u3000DESC', 'an ideographic space'],
  ])('%p (%s) is one field named as written, defaulting to ascending', entry => {
    expect(parse(entry)).toEqual({ field: entry, direction: Sorts.ASC });
  });

  test('Unicode whitespace at the ends is still trimmed', () => {
    expect(parse('\u00a0name DESC\u00a0')).toEqual({ field: 'name', direction: Sorts.DESC });
  });
});

describe('parseOrderEntry - rejected entries are 400s', () => {
  test.each([[''], ['   '], ['\t']])('an entry with no field %p is a 400', entry => {
    const error = captureError(() => parse(entry));

    expect(error.statusCode).toBe(400);
  });

  test.each([['name sideways'], ['name ascending'], ['name DESCX'], ['name 1']])(
    'an invalid direction %p is a 400 naming the whole entry',
    entry => {
      const error = captureError(() => parse(entry));

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain(entry);
    },
  );

  test.each([['name DESC NULLS LAST'], ['name ASC extra'], ['a b c']])(
    'more than two tokens %p is a 400 naming the whole entry, not a silent truncation',
    entry => {
      const error = captureError(() => parse(entry));

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain(entry);
    },
  );

  test('extra tokens separated by tabs are rejected the same way', () => {
    const error = captureError(() => parse('name\tDESC\tNULLS'));

    expect(error.statusCode).toBe(400);
  });
});

/** Whether a message carries a C0 control (line break, ESC, NUL...) - what JSON.stringify escapes. */
const hasControlCharacter = (text: string): boolean => {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 32) {
      return true;
    }
  }

  return false;
};

describe('parseOrderEntry - the entry is quoted with JSON.stringify in every message', () => {
  test.each([
    ['\n\t\n', 'no field, only line breaks'],
    ['a\nFAKE LOG LINE b', 'too many tokens, one a forged log line'],
    ['name \u001b[31mdesc', 'invalid direction carrying an ESC sequence'],
    ['name ASC\u0000', 'invalid direction carrying a NUL'],
  ])('%p (%s) is a single-line 400 with the entry escaped', entry => {
    const error = captureError(() => parse(entry));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain(JSON.stringify(entry));
    expect(hasControlCharacter(error.message)).toBe(false);
  });

  test('the escapes appear literally, so a reader sees what was sent', () => {
    expect(captureError(() => parse('a\nFAKE LOG LINE b')).message).toContain('\\n');
    expect(captureError(() => parse('name \u001b[31mdesc')).message).toContain('\\u001b');
    expect(captureError(() => parse('name ASC\u0000')).message).toContain('\\u0000');
  });

  test.each([['name sideways'], ['name DESC NULLS LAST']])(
    'a plain entry %p is quoted as a JSON string',
    entry => {
      expect(captureError(() => parse(entry)).message).toContain(`"${entry}"`);
    },
  );
});

describe('parseOrderEntry - result type', () => {
  test('direction is typed TSortDirection, which is exactly the Sorts values', () => {
    const parsed = parse('name DESC');

    // Enforced by tsc, not by the runner: both assignments compile only while the types match.
    const direction: TSortDirection = parsed.direction;
    const literal: 'asc' | 'desc' = direction;
    const fromSorts: TSortDirection = Sorts.DESC;

    // @ts-expect-error - a string outside the Sorts values is not a TSortDirection
    const outside: TSortDirection = 'sideways';

    expect(literal).toBe(fromSorts);
    expect(outside).toBe('sideways');
  });
});

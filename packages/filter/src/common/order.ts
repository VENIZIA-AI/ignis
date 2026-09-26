import { getError } from '@venizia/ignis-inversion';
import { Sorts } from './operators';
import type { TParsedOrderEntry, TSortDirection } from './types';

// ASCII whitespace: space, tab, line feed, vertical tab, form feed, carriage return.
const isSeparator = (code: number): boolean => code === 32 || (code >= 9 && code <= 13);

const toSortDirection = (opts: { direction: string }): TSortDirection | undefined => {
  const { direction } = opts;

  // The spellings callers write, compared without allocating; anything else is lowercased.
  switch (direction) {
    case 'ASC':
    case 'asc': {
      return Sorts.ASC;
    }
    case 'DESC':
    case 'desc': {
      return Sorts.DESC;
    }
    default: {
      const lowered = direction.toLowerCase();
      return lowered === Sorts.ASC || lowered === Sorts.DESC ? lowered : undefined;
    }
  }
};

/**
 * Reads one order entry - `field` or `field direction`, tokens separated by whitespace, direction
 * `ASC` or `DESC` in any case (default `ASC`). Throws a 400 naming the whole entry when the field is
 * missing, the direction is unknown, or the entry has more than two tokens.
 */
export const parseOrderEntry = (opts: { entry: string }): TParsedOrderEntry => {
  const { entry } = opts;
  const trimmed = entry.trim();
  const length = trimmed.length;

  if (length === 0) {
    throw getError({
      statusCode: 400,
      message: `[parseOrderEntry] Order entry has no field | entry: '${entry}'`,
    });
  }

  let fieldEnd = 0;
  while (fieldEnd < length && !isSeparator(trimmed.charCodeAt(fieldEnd))) {
    fieldEnd++;
  }

  if (fieldEnd === length) {
    return { field: trimmed, direction: Sorts.ASC };
  }

  // `trimmed` ends on a non-separator, so a direction token follows the gap.
  let directionStart = fieldEnd + 1;
  while (isSeparator(trimmed.charCodeAt(directionStart))) {
    directionStart++;
  }

  let directionEnd = directionStart + 1;
  while (directionEnd < length && !isSeparator(trimmed.charCodeAt(directionEnd))) {
    directionEnd++;
  }

  if (directionEnd !== length) {
    throw getError({
      statusCode: 400,
      message: `[parseOrderEntry] Too many tokens | entry: '${entry}' | Expected: '<field>' or '<field> ASC|DESC'`,
    });
  }

  const direction = toSortDirection({ direction: trimmed.slice(directionStart) });

  if (!direction) {
    throw getError({
      statusCode: 400,
      message: `[parseOrderEntry] Invalid direction | entry: '${entry}' | Expected: 'ASC' or 'DESC'`,
    });
  }

  return { field: trimmed.slice(0, fieldEnd), direction };
};

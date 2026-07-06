import { getError } from '@/modules/error';
import get from 'lodash/get';
import round from 'lodash/round';

const INTL_0_DIGITS_FORMATER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const INTL_2_DIGITS_FORMATER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export const getUID = () => Math.random().toString(36).slice(2).toUpperCase();

export const toCamel = (s: string) => {
  return s.replace(/([-_][a-z])/gi, (sub: string) => {
    return sub.toUpperCase().replace('-', '').replace('_', '');
  });
};

export const keysToCamel = (object: object) => {
  const n: any = {};
  const keys = Object.keys(object);

  for (const key of keys) {
    const value = get(object, key);

    let valueType: string = typeof value;
    if (Array.isArray(value)) {
      valueType = 'array';
    } else if (value instanceof Date) {
      valueType = 'date';
    }

    switch (valueType) {
      case 'object': {
        if (!value) {
          n[toCamel(key)] = value;
          break;
        }

        n[toCamel(key)] = keysToCamel(value);
        break;
      }
      default: {
        n[toCamel(key)] = value;
        break;
      }
    }
  }

  return n;
};

export const isInt = (n: any) => {
  if (isNaN(n)) {
    return false;
  }

  return Number.isInteger(n) || Math.floor(Number(n)) === n || Number(n) % 1 === 0;
};

export const isFloat = (input: any) => {
  if (isNaN(input)) {
    return false;
  }

  return Number(input) === input || Number(input) % 1 !== 0;
};

export const int = (input: any) => {
  if (!input || isNaN(input)) {
    return 0;
  }

  const normalized = input?.toString()?.replace(/,/g, '');
  return Number.parseInt(normalized, 10) ?? 0;
};

export const float = (input: any, digit = 2) => {
  if (!input || isNaN(input)) {
    return 0;
  }

  const normalized = input?.toString()?.replace(/,/g, '');
  return round(Number.parseFloat(normalized), digit);
};

export const toBoolean = (input: any): boolean => {
  return (
    input !== '' &&
    input !== 'false' &&
    input !== '0' &&
    input !== false &&
    input !== 0 &&
    input !== null &&
    input !== undefined
  );
};

export const toStringDecimal = (input: any, digit = 2, options = { useLocaleFormat: true }) => {
  const { useLocaleFormat } = options;
  if (isNaN(input)) {
    return 0;
  }

  const number = isInt(input) ? int(input) : float(input, digit);

  if (!useLocaleFormat) {
    return number.toFixed(digit);
  }

  if (Number.isInteger(number)) {
    return INTL_0_DIGITS_FORMATER.format(number);
  }

  if (digit === 2) {
    return INTL_2_DIGITS_FORMATER.format(number);
  }

  const formater = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digit,
    minimumFractionDigits: digit,
  });
  return formater.format(number);
};

export const getNumberValue = (
  input: string,
  opts?: { method?: 'int' | 'float'; locale?: 'us' | 'eu' },
) => {
  const { method = 'int', locale = 'us' } = opts ?? {};

  if (!input) {
    return 0;
  }

  let raw: any;

  switch (typeof input) {
    case 'string': {
      if (locale === 'eu') {
        // EU format: dot is thousands separator, comma is decimal
        // "1.234,56" → "1234.56"
        raw = input.replace(/\./g, '').replace(/,/g, '.');
      } else {
        // US/International format: comma is thousands separator, dot is decimal
        // "1,234.56" → "1234.56"
        raw = input.replace(/,/g, '');
      }
      break;
    }
    default: {
      raw = input;
      break;
    }
  }

  switch (method) {
    case 'int': {
      return int(raw);
    }
    default: {
      return float(raw);
    }
  }
};

/** Converts an array to a Record keyed by `keyMap`. Last element wins on duplicate keys. */
export const parseArrayToRecordWithKey = <
  T extends Record<K, PropertyKey>,
  K extends keyof T,
>(opts: {
  arr: T[];
  keyMap: K;
}): Record<T[K], T> => {
  const { arr, keyMap } = opts;

  const resultRecord: Record<T[K], T> = {} as Record<T[K], T>;

  if (!arr.length) {
    return resultRecord;
  }

  arr.forEach(element => {
    if (!(keyMap in element)) {
      throw getError({
        message: 'Invalid keyMap',
      });
    }
    resultRecord[element[keyMap]] = element;
  });

  return resultRecord;
};

/** Converts an array to a Map keyed by `keyMap`. Last element wins on duplicate keys. */
export const parseArrayToMapWithKey = <T extends Record<K, PropertyKey>, K extends keyof T>(
  arr: T[],
  keyMap: K,
): Map<T[K], T> => {
  const resultMap = new Map<T[K], T>();

  if (!arr.length) {
    return resultMap;
  }

  arr.forEach(element => {
    if (!(keyMap in element)) {
      throw getError({
        message: 'Invalid keyMap',
      });
    }
    resultMap.set(element[keyMap], element);
  });

  return resultMap;
};

/** Splits a delimited string into trimmed, non-empty entries - the transform for list-shaped
 * env values (e.g. `applicationEnvironment.get(KEY, { transform: toDelimitedArray })`). */
export const toDelimitedArray = (input: unknown, separator = ','): string[] => {
  if (input == null) {
    return [];
  }

  return String(input)
    .split(separator)
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
};

/** Trims a possibly-undefined env value to a clean string ('' when absent). */
export const toTrimmed = (input: unknown): string => {
  if (input == null) {
    return '';
  }

  return String(input).trim();
};

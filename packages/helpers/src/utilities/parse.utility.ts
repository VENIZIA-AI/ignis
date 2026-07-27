import { getError } from '@/modules/error';
import get from 'lodash/get';
import round from 'lodash/round';

export const getUID = () => Math.random().toString(36).slice(2).toUpperCase();

export const toCamel = (s: string) => {
  return s.replace(/([-_][a-z])/gi, (sub: string) => {
    return sub.toUpperCase().replace('-', '').replace('_', '');
  });
};

/** Arrays stay arrays - mapping one through the object branch would turn it into an index-keyed object - but their object elements still need their keys camelized. Dates are opaque values. */
const camelizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(element => camelizeValue(element));
  }

  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  const camelized: any = {};
  for (const key of Object.keys(value)) {
    camelized[toCamel(key)] = camelizeValue(get(value, key));
  }

  return camelized;
};

export const keysToCamel = (object: object) => {
  const n: any = {};
  const keys = Object.keys(object);

  for (const key of keys) {
    n[toCamel(key)] = camelizeValue(get(object, key));
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
  if (!input) {
    return 0;
  }

  const normalized = input?.toString()?.replace(/,/g, '');
  if (isNaN(normalized)) {
    return 0;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const float = (input: any, digit = 2) => {
  if (!input) {
    return 0;
  }

  const normalized = input?.toString()?.replace(/,/g, '');
  if (isNaN(normalized)) {
    return 0;
  }

  const parsed = round(Number.parseFloat(normalized), digit);
  return Number.isNaN(parsed) ? 0 : parsed;
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

/** Splits a delimited string into trimmed, non-empty entries - the transform for list-shaped env values (e.g. `applicationEnvironment.get(KEY, { transform: toDelimitedArray })`). */
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

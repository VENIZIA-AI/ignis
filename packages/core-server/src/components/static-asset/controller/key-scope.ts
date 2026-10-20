import { StorageErrors, type IStorageHelper } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';

/** `tenant-a`, `/tenant-a` and `tenant-a/` all become `tenant-a/`: without the slash, `tenant-a` would also own `tenant-ab/`. */
export const normalizeKeyPrefix = (opts: {
  keyPrefix: string;
  helper: IStorageHelper;
  scope: string;
}): { keyPrefix: string; depth: number } => {
  const { keyPrefix, helper, scope } = opts;
  const trimmed = keyPrefix.replace(/^\/+|\/+$/g, '');
  const segments = trimmed ? trimmed.split('/') : [];

  if (segments.length === 0 || segments.some(segment => !helper.isValidSegment({ segment }))) {
    throw getError({
      message: `[${scope}] controller.keyPrefix must be one or more valid key segments | value: ${keyPrefix}`,
    });
  }

  return { keyPrefix: `${trimmed}/`, depth: segments.length };
};

export const isKeyInScope = (opts: { key: string; keyPrefix?: string }): boolean =>
  opts.keyPrefix === undefined || opts.key.startsWith(opts.keyPrefix);

/** A key outside the scope answers as a missing object does, so a caller learns nothing about keys it does not own. */
export const assertKeyInScope = (opts: { key: string; keyPrefix?: string }): void => {
  if (isKeyInScope(opts)) {
    return;
  }

  throw getError({
    error: StorageErrors.OBJECT_NOT_FOUND,
    message: `Object not found | key: ${opts.key}`,
  });
};

/** A caller prefix wider than the scope is narrowed to it; one wholly outside it lists nothing. */
export const resolveScopedListPrefix = (opts: {
  prefix?: string;
  keyPrefix?: string;
}): { prefix?: string; isOutOfScope: boolean } => {
  const { prefix, keyPrefix } = opts;

  if (keyPrefix === undefined) {
    return { prefix, isOutOfScope: false };
  }

  if (!prefix || keyPrefix.startsWith(prefix)) {
    return { prefix: keyPrefix, isOutOfScope: false };
  }

  return { prefix, isOutOfScope: !prefix.startsWith(keyPrefix) };
};

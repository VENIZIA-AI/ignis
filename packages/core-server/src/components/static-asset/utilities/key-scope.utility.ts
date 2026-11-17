import { StorageErrors, type IStorageHelper } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';
import { StaticAssetDefaults } from '../common';

export class StaticAssetKeyScopeUtility {
  /** `tenant-a`, `/tenant-a` and `tenant-a/` all become `tenant-a/`: without the slash, `tenant-a` would also own `tenant-ab/`. */
  static normalizePrefix(opts: { keyPrefix: string; helper: IStorageHelper; scope: string }): {
    keyPrefix: string;
    depth: number;
  } {
    const { keyPrefix, helper, scope } = opts;
    const trimmed = keyPrefix.replace(/^\/+|\/+$/g, '');
    const segments = trimmed ? trimmed.split('/') : [];

    if (segments.length === 0 || segments.some((segment) => !helper.isValidSegment({ segment }))) {
      throw getError({
        message: `[${scope}] keyPrefix must be one or more valid key segments | value: ${keyPrefix}`,
      });
    }

    return { keyPrefix: `${trimmed}/`, depth: segments.length };
  }

  /**
   * The two prefixes of a direct upload, in ONE place: the policy signs `policyKeyPrefix`, and the
   * commit strips `pendingPrefix` from the key it reads back, so the two have to be computed alike.
   * The scope rides inside the pending key, so a commit lands inside it.
   *
   * A pending object must never be readable through the entry's own routes, so `pendingPrefix` is
   * refused unless it is a valid key prefix of its own, disjoint from `keyPrefix`: neither starts
   * with the other. Both are checked once, at boot, with the entry's name.
   */
  static resolveDirectUploadPrefixes(opts: {
    keyPrefix: string;
    pendingPrefix?: string;
    helper: IStorageHelper;
    scope: string;
  }): { keyPrefix: string; pendingPrefix: string; policyKeyPrefix: string } {
    const { helper, scope } = opts;
    const { keyPrefix } = StaticAssetKeyScopeUtility.normalizePrefix({
      keyPrefix: opts.keyPrefix,
      helper,
      scope,
    });
    const pendingPrefix = opts.pendingPrefix ?? StaticAssetDefaults.PENDING_PREFIX;
    const segments = pendingPrefix.slice(0, -1).split('/');

    if (
      pendingPrefix.length < 2 ||
      !pendingPrefix.endsWith('/') ||
      segments.some((segment) => !helper.isValidSegment({ segment }))
    ) {
      throw getError({
        message: `[${scope}] directUpload.pendingPrefix must be one or more valid key segments, each followed by a slash | value: '${pendingPrefix}'`,
      });
    }

    if (pendingPrefix.startsWith(keyPrefix) || keyPrefix.startsWith(pendingPrefix)) {
      throw getError({
        message: `[${scope}] directUpload.pendingPrefix and keyPrefix must not contain one another | pendingPrefix: '${pendingPrefix}' | keyPrefix: '${keyPrefix}' | a pending object would be readable through this entry's routes`,
      });
    }

    return { keyPrefix, pendingPrefix, policyKeyPrefix: `${pendingPrefix}${keyPrefix}` };
  }

  static isInScope(opts: { key: string; keyPrefix?: string }): boolean {
    return opts.keyPrefix === undefined || opts.key.startsWith(opts.keyPrefix);
  }

  /** A key outside the scope answers as a missing object does, so a caller learns nothing about keys it does not own. */
  static assertInScope(opts: { key: string; keyPrefix?: string }): void {
    if (StaticAssetKeyScopeUtility.isInScope(opts)) {
      return;
    }

    throw getError({
      error: StorageErrors.OBJECT_NOT_FOUND,
      message: `Object not found | key: ${opts.key}`,
    });
  }

  /** A caller prefix wider than the scope is narrowed to it; one wholly outside it lists nothing. */
  static resolveListPrefix(opts: { prefix?: string; keyPrefix?: string }): {
    prefix?: string;
    isOutOfScope: boolean;
  } {
    const { prefix, keyPrefix } = opts;

    if (keyPrefix === undefined) {
      return { prefix, isOutOfScope: false };
    }

    if (!prefix || keyPrefix.startsWith(prefix)) {
      return { prefix: keyPrefix, isOutOfScope: false };
    }

    return { prefix, isOutOfScope: !prefix.startsWith(keyPrefix) };
  }
}

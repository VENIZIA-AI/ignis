import { getError } from '@venizia/ignis-helpers/core';
import type {
  IDeprecatedModelSetting,
  IModelAccessSettings,
  IModelSettings,
} from '@/helpers/inversion';

/** The release that drops the deprecated keys. */
export const DEPRECATED_MODEL_SETTINGS_REMOVED_IN = '0.4.3';

const conflict = (opts: { model: string; old: string; use: string }) => {
  return getError({
    message: `[model][${opts.model}] settings.${opts.old} and settings.${opts.use} are both set | ${opts.old} is the deprecated name of ${opts.use} | keep ${opts.use} and remove ${opts.old}`,
  });
};

/**
 * The one place the old flat settings become the new grouped ones. Everything that reads model
 * settings reads the result, so no reader knows two shapes.
 *
 * - `defaultFilter` -> `query.filter`; `defaultLimit` -> `query.limit.default`; `maxLimit` ->
 *   `query.limit.max`; `scopeFilter` -> `access` (`writeGuard` -> `access.write.mode`, `sharedRows`
 *   -> `access.write.sharedRows`).
 * - An old key together with the key that replaces it is an error.
 * - Returns the old keys in use so the application can warn once at boot.
 */
export const normalizeModelSettings = (opts: {
  model: string;
  settings: IModelSettings | undefined;
}): { settings: IModelSettings | undefined; deprecated: IDeprecatedModelSetting[] } => {
  const { model, settings } = opts;

  if (!settings) {
    return { settings, deprecated: [] };
  }

  const { defaultFilter, defaultLimit, maxLimit, scopeFilter, ...current } = settings;
  const deprecated: IDeprecatedModelSetting[] = [];
  const normalized: IModelSettings = { ...current };

  if (defaultFilter !== undefined) {
    if (current.query?.filter !== undefined) {
      throw conflict({ model, old: 'defaultFilter', use: 'query.filter' });
    }

    normalized.query = { ...normalized.query, filter: defaultFilter };
    deprecated.push({ key: 'defaultFilter', use: 'query.filter' });
  }

  if (defaultLimit !== undefined) {
    if (current.query?.limit?.default !== undefined) {
      throw conflict({ model, old: 'defaultLimit', use: 'query.limit.default' });
    }

    normalized.query = {
      ...normalized.query,
      limit: { ...normalized.query?.limit, default: defaultLimit },
    };
    deprecated.push({ key: 'defaultLimit', use: 'query.limit.default' });
  }

  if (maxLimit !== undefined) {
    if (current.query?.limit?.max !== undefined) {
      throw conflict({ model, old: 'maxLimit', use: 'query.limit.max' });
    }

    normalized.query = {
      ...normalized.query,
      limit: { ...normalized.query?.limit, max: maxLimit },
    };
    deprecated.push({ key: 'maxLimit', use: 'query.limit.max' });
  }

  if (scopeFilter !== undefined) {
    if (current.access !== undefined) {
      throw conflict({ model, old: 'scopeFilter', use: 'access' });
    }

    const { writeGuard, sharedRows, ...rest } = scopeFilter;
    const access: IModelAccessSettings = { ...rest };
    deprecated.push({ key: 'scopeFilter', use: 'access' });

    if (writeGuard !== undefined) {
      access.write = { ...access.write, mode: writeGuard };
      deprecated.push({ key: 'scopeFilter.writeGuard', use: 'access.write.mode' });
    }

    if (sharedRows !== undefined) {
      access.write = { ...access.write, sharedRows };
      deprecated.push({ key: 'scopeFilter.sharedRows', use: 'access.write.sharedRows' });
    }

    normalized.access = access;
  }

  return { settings: normalized, deprecated };
};

import { getError } from '@venizia/ignis-helpers/core';

/** The keys 0.4.2 deprecated and 0.4.3 removed, and the key that replaces each. */
const REMOVED_MODEL_SETTINGS: Record<string, string> = {
  defaultFilter: 'query.filter',
  defaultLimit: 'query.limit.default',
  maxLimit: 'query.limit.max',
  scopeFilter: 'access',
};

/**
 * Refuses a removed `@model` settings key. A model that still says `scopeFilter` would otherwise
 * lose its row scope without a sound (a plain-JavaScript or `any`-typed model gets no type error),
 * so the decorator throws instead, naming the key to use. `devz codemod model-settings --write` rewrites
 * the keys.
 */
export const assertNoRemovedModelSettings = (opts: {
  model: string;
  settings: object | undefined;
}): void => {
  const { model, settings } = opts;

  if (!settings) {
    return;
  }

  const removed = Object.keys(REMOVED_MODEL_SETTINGS).filter((key) => Object.hasOwn(settings, key));
  if (removed.length === 0) {
    return;
  }

  throw getError({
    message: `[model][${model}] Removed settings key(s): ${removed
      .map((key) => `settings.${key} (use settings.${REMOVED_MODEL_SETTINGS[key]})`)
      .join(', ')} | removed in 0.4.3 | run 'devz codemod model-settings --write' to rewrite them`,
  });
};

import { resolveValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import { BaseSearchEntity } from '@/search/core/models';

/**
 * Refuses to boot when a model declares `settings.scopeFilter` in a place that cannot honour it.
 *
 * Both cases fail SILENTLY at runtime today, in opposite directions - which is the point of checking
 * at boot rather than letting either surface as a support ticket:
 *
 * - a search-backed model returns MORE rows than intended (no scope is applied at all);
 * - a model with no ambient request context returns NONE (`resolve()` sees no context, and
 *   `onMissing` denies by default), with nothing naming the config flag as the cause.
 *
 * Lives in connectors because this is the package that both applies `scopeFilter` (relational) and
 * ignores it (search); the caller supplies `asyncContextEnabled` so no application config type
 * reaches down here.
 */
export const assertScopeFilterSupported = (opts: { asyncContextEnabled: boolean }): void => {
  const models = MetadataRegistry.getInstance().getAllModels();

  const searchBacked: string[] = [];
  const withoutAmbientContext: string[] = [];

  for (const [name, entry] of models) {
    if (!entry.metadata?.settings?.scopeFilter) {
      continue;
    }

    const modelClass = resolveValue(entry.target);

    if (modelClass === BaseSearchEntity || modelClass.prototype instanceof BaseSearchEntity) {
      searchBacked.push(name);
      continue;
    }

    if (!opts.asyncContextEnabled) {
      withoutAmbientContext.push(name);
    }
  }

  if (searchBacked.length > 0) {
    throw getError({
      message: [
        `[assertScopeFilterSupported] settings.scopeFilter on a search-backed model | models: ${searchBacked.join(', ')}`,
        'Search repositories never read this setting, so no row scope is applied.',
        'Unlike the relational path, a missing scope here returns MORE rows rather than none - nothing fails, the result is just wider.',
        'Scope the search query in the application, and remove settings.scopeFilter from the model.',
      ].join(' | '),
    });
  }

  if (withoutAmbientContext.length > 0) {
    throw getError({
      message: [
        `[assertScopeFilterSupported] settings.scopeFilter declared while asyncContext.enable is false | models: ${withoutAmbientContext.join(', ')}`,
        'scopeFilter.resolve() takes no arguments, so the ambient request context is its only input.',
        'With no context store every resolve() returns undefined, onMissing denies by default, and EVERY query on these models matches zero rows - with nothing naming the flag as the cause.',
        'Set asyncContext.enable to true, or remove settings.scopeFilter.',
      ].join(' | '),
    });
  }
};

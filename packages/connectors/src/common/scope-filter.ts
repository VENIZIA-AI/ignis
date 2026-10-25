import { resolveValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { MetadataRegistry, ScopeWriteGuards } from '@venizia/ignis-kernel';
import { BaseSearchEntity } from '@/search/core/models';
import { getTableColumns, is, Table } from 'drizzle-orm';

/**
 * Refuses to boot when `settings.scopeFilter` is declared where it cannot be honoured. Both cases
 * are silent at runtime and fail in OPPOSITE directions: a search-backed model returns more rows,
 * a context-less one returns none. The caller supplies `asyncContextEnabled` so no application
 * config type reaches into this tier.
 */
export const assertScopeFilterSupported = (opts: { asyncContextEnabled: boolean }): void => {
  const models = MetadataRegistry.getInstance().getAllModels();

  const searchBacked: string[] = [];
  const withoutAmbientContext: string[] = [];
  const invalidWriteGuard: string[] = [];

  for (const [name, entry] of models) {
    if (!entry.metadata?.settings?.scopeFilter) {
      continue;
    }

    const modelClass = resolveValue({ value: entry.target });

    if (modelClass === BaseSearchEntity || modelClass.prototype instanceof BaseSearchEntity) {
      searchBacked.push(name);
      continue;
    }

    if (!opts.asyncContextEnabled) {
      withoutAmbientContext.push(name);
    }

    const { writeGuard, columns } = entry.metadata.settings.scopeFilter;

    if (writeGuard !== undefined && !ScopeWriteGuards.isValid(writeGuard)) {
      invalidWriteGuard.push(`${name}: writeGuard '${String(writeGuard)}' is not reject or assign`);
    }

    if (columns !== undefined) {
      const schema = (modelClass as { schema?: unknown }).schema;
      const known = is(schema, Table) ? Object.keys(getTableColumns(schema)) : undefined;
      const unknown = columns.filter((column) => known !== undefined && !known.includes(column));

      if (!Array.isArray(columns) || columns.length === 0) {
        invalidWriteGuard.push(`${name}: columns must be a non-empty list of property names`);
      } else if (unknown.length > 0) {
        invalidWriteGuard.push(
          `${name}: columns names ${unknown.join(', ')}, which the model does not have`,
        );
      }
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

  if (invalidWriteGuard.length > 0) {
    throw getError({
      message: [
        `[assertScopeFilterSupported] invalid settings.scopeFilter write guard | ${invalidWriteGuard.join(' | ')}`,
        'writeGuard is reject or assign; columns, when declared, names properties of the model.',
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

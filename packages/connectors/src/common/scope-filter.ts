import { ResolverUtility } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { ILogger } from '@venizia/ignis-helpers/core';
import { MetadataRegistry, ScopeWriteGuards } from '@venizia/ignis-kernel';
import type { IModelRegistryEntry } from '@venizia/ignis-kernel';
import { ScopeThroughLink } from '@/relational/core/repositories/common/scope-through';
import { BaseSearchEntity } from '@/search/core/models';
import { getTableColumns, is, Table } from 'drizzle-orm';

export class ScopeFilterUtility {
  /**
   * Why a `through` chain cannot work, or undefined. Walks from `name` toward the model that holds a resolver: every
   * hop needs a `one` relation with a single-column key, the parent needs an `access`, and the chain is at most
   * `ScopeThroughLink.MAX_DEPTH` hops with no model twice. A key with no index is a warning: it still works, slowly.
   */
  private static throughProblem(opts: {
    name: string;
    models: Map<string, IModelRegistryEntry>;
    logger?: ILogger;
  }): string | undefined {
    const { name, models, logger } = opts;
    const visited = new Set([name]);
    let current = models.get(name);
    let hops = 0;

    while (current?.metadata?.settings?.access?.through) {
      hops += 1;

      if (hops > ScopeThroughLink.MAX_DEPTH) {
        return `through is deeper than ${ScopeThroughLink.MAX_DEPTH} hops`;
      }

      let link: ReturnType<typeof ScopeThroughLink.of>;

      try {
        link = ScopeThroughLink.of({
          schema: current.schema as never,
          relation: current.metadata.settings.access.through.relation,
          relations: ScopeThroughLink.relationsOf({ entry: current }),
        });
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }

      if (
        hops === 1 &&
        !ScopeThroughLink.isIndexed({
          schema: current.schema as never,
          property: link.childProperty,
        })
      ) {
        logger
          ?.for('assertScopeFilterSupported')
          .warn(
            '%s: the foreign key %s has no index, so every scoped read scans the table',
            name,
            link.childProperty,
          );
      }

      const parent = [...models].find(([, entry]) => entry.schema === link.parentSchema);

      if (!parent?.[1].metadata?.settings?.access) {
        return `the parent ${parent?.[0] ?? 'model'} has no access setting`;
      }

      if (visited.has(parent[0])) {
        return `through goes in a cycle at ${parent[0]}`;
      }

      visited.add(parent[0]);
      current = parent[1];
    }

    return undefined;
  }

  /**
   * Refuses to boot when `settings.access` is declared where it cannot be honoured. Both cases
   * are silent at runtime and fail in OPPOSITE directions: a search-backed model returns more rows,
   * a context-less one returns none. The caller supplies `asyncContextEnabled` so no application
   * config type reaches into this tier.
   */
  static assertScopeFilterSupported(opts: {
    asyncContextEnabled: boolean;
    logger?: ILogger;
  }): void {
    const models = MetadataRegistry.getInstance().getAllModels();

    const searchBacked: string[] = [];
    const withoutAmbientContext: string[] = [];
    const invalidWriteGuard: string[] = [];
    const invalidThrough: string[] = [];

    for (const [name, entry] of models) {
      if (!entry.metadata?.settings?.access) {
        continue;
      }

      const modelClass = ResolverUtility.resolveValue({ value: entry.target });

      if (modelClass === BaseSearchEntity || modelClass.prototype instanceof BaseSearchEntity) {
        searchBacked.push(name);
        continue;
      }

      if (!opts.asyncContextEnabled) {
        withoutAmbientContext.push(name);
      }

      const { access } = entry.metadata.settings;

      if (!access.through === !access.resolve) {
        invalidThrough.push(`${name}: declare resolve or through, not both and not neither`);
        continue;
      }

      if (access.through) {
        const problem = ScopeFilterUtility.throughProblem({ name, models, logger: opts.logger });

        if (access.columns || access.write) {
          invalidThrough.push(`${name}: columns and write belong to a resolver, not to through`);
        }

        if (problem) {
          invalidThrough.push(`${name}: ${problem}`);
        }

        continue;
      }

      const { columns, write } = access;
      const writeGuard = write?.mode;

      if (writeGuard !== undefined && !ScopeWriteGuards.isValid(writeGuard)) {
        invalidWriteGuard.push(
          `${name}: write.mode '${String(writeGuard)}' is not reject or assign`,
        );
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
          `[assertScopeFilterSupported] settings.access on a search-backed model | models: ${searchBacked.join(', ')}`,
          'Search repositories never read this setting, so no row scope is applied.',
          'Unlike the relational path, a missing scope here returns MORE rows rather than none - nothing fails, the result is just wider.',
          'Scope the search query in the application, and remove settings.access from the model.',
        ].join(' | '),
      });
    }

    if (invalidThrough.length > 0) {
      throw getError({
        message: [
          `[assertScopeFilterSupported] invalid settings.access.through | ${invalidThrough.join(' | ')}`,
          'A model declares resolve or through. A through names a one relation whose parent has an access of its own.',
        ].join(' | '),
      });
    }

    if (invalidWriteGuard.length > 0) {
      throw getError({
        message: [
          `[assertScopeFilterSupported] invalid settings.access write guard | ${invalidWriteGuard.join(' | ')}`,
          'write.mode is reject or assign; columns, when declared, names properties of the model.',
        ].join(' | '),
      });
    }

    if (withoutAmbientContext.length > 0) {
      throw getError({
        message: [
          `[assertScopeFilterSupported] settings.access declared while asyncContext.enable is false | models: ${withoutAmbientContext.join(', ')}`,
          'access.resolve() reads the ambient request context; the operation is its only argument.',
          'With no context store every resolve() returns undefined, onMissing denies by default, and EVERY query on these models matches zero rows - with nothing naming the flag as the cause.',
          'Set asyncContext.enable to true, or remove settings.access.',
        ].join(' | '),
      });
    }
  }
}

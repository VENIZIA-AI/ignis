import { ArtifactTypes, MetadataRegistry } from '@/helpers/inversion';
import type { IModelMetadata } from '@/helpers/inversion';
import { getError } from '@venizia/ignis-helpers/core';
import { injectable, InjectableUtility } from '../injectable';
import { ModelMetadataUtility } from '../model-metadata';

/**
 * Registers a model class with its static schema and relations.
 *
 * @example
 * ```typescript
 * import { model } from '@venizia/ignis';
 * import { ModelFactory } from '@venizia/ignis-connectors/postgres';
 * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
 *
 * const noteTable = pgTable('Note', { id: serial('id').primaryKey(), body: text('body') });
 *
 * export @model({ settings: { query: { limit: { default: 20 } } } })
 * class Note extends ModelFactory.defineEntity({ table: noteTable }) {}
 * ```
 */
export const model = (input: IModelMetadata = {}): ClassDecorator => {
  return (target) => {
    injectable({
      type: ArtifactTypes.MODEL,
      ...InjectableUtility.pickRegistrationOptions({ metadata: input }),
    })(target);

    const metadata = ModelMetadataUtility.normalizeModelMetadata({
      model: target.name,
      metadata: input,
    });

    const { settings } = metadata;

    if (settings && Reflect.has(settings, 'hiddenProperties')) {
      throw getError({
        message: `[model][${target.name}] hiddenProperties was replaced by properties.hidden`,
      });
    }

    const defaultLimit = settings?.query?.limit?.default;

    if (defaultLimit !== undefined && (!Number.isInteger(defaultLimit) || defaultLimit <= 0)) {
      throw getError({
        message: `[model][${target.name}] Invalid 'query.limit.default' | Expected a positive integer | Got: ${defaultLimit}`,
      });
    }

    // Validated at DECORATION time, like the default limit: a bad ceiling is a wiring mistake, and
    // catching it at boot beats catching it on the one request that happens to reach the limit.
    const maxLimit = settings?.query?.limit?.max;

    if (maxLimit !== undefined && (!Number.isInteger(maxLimit) || maxLimit <= 0)) {
      throw getError({
        message: `[model][${target.name}] Invalid 'query.limit.max' | Expected a positive integer | Got: ${maxLimit}`,
      });
    }

    // Auto-populate AUTHORIZATION_SUBJECT from authorize.principal if not already set
    const principal = settings?.authorize?.principal;

    if (principal && !Object.hasOwn(target, 'AUTHORIZATION_SUBJECT')) {
      Reflect.set(target, 'AUTHORIZATION_SUBJECT', principal);
    }

    MetadataRegistry.getInstance().registerModel({ target, metadata });
  };
};

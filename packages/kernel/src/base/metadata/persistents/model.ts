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

    // Every model has an authorization subject: the principal it declares, else its own name. A subject the class declares
    // itself is kept. The value is DEFINED on the class, not assigned: an entity base answers a fallback through a getter,
    // and an assignment to a getter-only inherited property does nothing.
    if (!Object.hasOwn(target, 'AUTHORIZATION_SUBJECT')) {
      const subject = settings?.authorize?.principal || target.name;
      const isDefined = Reflect.defineProperty(target, 'AUTHORIZATION_SUBJECT', {
        value: subject,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      if (!isDefined) {
        throw getError({
          message: `[model][${target.name}] Cannot set 'AUTHORIZATION_SUBJECT' | The class is not extensible`,
        });
      }
    }

    MetadataRegistry.getInstance().registerModel({ target, metadata });
  };
};

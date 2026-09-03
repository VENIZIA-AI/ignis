import { z } from '@hono/zod-openapi';
import { getError } from '@venizia/ignis-helpers/core';
import omit from 'lodash/omit';

import type { TSchemaType } from '@venizia/ignis-kernel';
import { SchemaTypes } from '@venizia/ignis-kernel';
import type { ISearchCollectionDefinition, ISearchFieldDefinition } from './types';
import { SearchFieldTypes } from './types';

const buildBaseFieldSchema = (field: ISearchFieldDefinition): z.ZodTypeAny => {
  switch (field.type) {
    case SearchFieldTypes.STRING: {
      return z.string();
    }
    case SearchFieldTypes.NUMBER: {
      return z.number();
    }
    case SearchFieldTypes.BOOLEAN: {
      return z.boolean();
    }
    case SearchFieldTypes.GEOPOINT: {
      return z.tuple([z.number(), z.number()]);
    }
    case SearchFieldTypes.STRING_ARRAY: {
      return z.array(z.string());
    }
    case SearchFieldTypes.NUMBER_ARRAY: {
      return z.array(z.number());
    }
    case SearchFieldTypes.BOOLEAN_ARRAY: {
      return z.array(z.boolean());
    }
    case SearchFieldTypes.VECTOR: {
      return z.array(z.number());
    }
    default: {
      throw getError({
        message: `[deriveSearchDocumentSchema] Unsupported field type | field: ${field.name} | type: ${field.type}`,
      });
    }
  }
};

// A vector field carrying `vector.embed` is server auto-embedded, never client-supplied input/output, so it is dropped from the shape entirely (mirrors TSearchDocument's embed exclusion).
const buildFieldSchema = (field: ISearchFieldDefinition): z.ZodTypeAny | undefined => {
  if (field.type === SearchFieldTypes.VECTOR && field.vector?.embed) {
    return undefined;
  }

  const baseSchema = buildBaseFieldSchema(field);

  return field.optional ? baseSchema.optional() : baseSchema;
};

const buildShape = (fields: readonly ISearchFieldDefinition[]): Record<string, z.ZodTypeAny> => {
  const entries = fields
    .map(field => [field.name, buildFieldSchema(field)] as const)
    .filter((entry): entry is [string, z.ZodTypeAny] => entry[1] !== undefined);

  return Object.fromEntries(entries);
};

export const deriveSearchDocumentSchema = (opts: {
  definition: ISearchCollectionDefinition;
  type: TSchemaType;
}): z.ZodTypeAny => {
  const { definition, type } = opts;
  const shape = buildShape(definition.fields);

  switch (type) {
    case SchemaTypes.SELECT: {
      return z.object(shape);
    }
    case SchemaTypes.CREATE: {
      return z.object({ ...shape, id: z.string() });
    }
    case SchemaTypes.UPDATE: {
      return z.object(omit(shape, ['id'])).partial();
    }
    default: {
      throw getError({
        message: `[deriveSearchDocumentSchema] Invalid schema type | valid: [select | create | update] | name: ${definition.name} | type: ${type}`,
      });
    }
  }
};

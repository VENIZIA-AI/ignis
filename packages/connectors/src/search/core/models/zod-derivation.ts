import { z } from 'zod';
import { getError } from '@venizia/ignis-helpers/core';

import type { ISearchFieldDefinition } from './common';
import { SearchFieldTypes } from './common';

const buildBaseFieldSchema = (field: ISearchFieldDefinition): z.ZodType => {
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
const buildFieldSchema = (field: ISearchFieldDefinition): z.ZodType | undefined => {
  if (field.type === SearchFieldTypes.VECTOR && field.vector?.embed) {
    return undefined;
  }

  const baseSchema = buildBaseFieldSchema(field);

  return field.optional ? baseSchema.optional() : baseSchema;
};

/** Reached by `SearchCollectionFactory.deriveDocumentSchema` through a deep import: the barrel must not re-export it. */
export const buildShape = (
  fields: readonly ISearchFieldDefinition[],
): Record<string, z.ZodType> => {
  const entries = fields
    .map((field) => [field.name, buildFieldSchema(field)] as const)
    .filter((entry): entry is [string, z.ZodType] => entry[1] !== undefined);

  return Object.fromEntries(entries);
};

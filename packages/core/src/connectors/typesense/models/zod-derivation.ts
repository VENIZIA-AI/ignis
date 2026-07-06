import { z } from '@hono/zod-openapi';
import { getError } from '@venizia/ignis-helpers';

import { SchemaTypes, TSchemaType } from '@/base/models';
import { ISearchCollectionDefinition, ISearchFieldDefinition, SearchFieldTypes } from './types';

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
    default: {
      throw getError({
        message: `[deriveSearchDocumentSchema] Unsupported field type | field: ${field.name} | type: ${field.type}`,
      });
    }
  }
};

const buildFieldSchema = (field: ISearchFieldDefinition): z.ZodTypeAny => {
  const baseSchema = buildBaseFieldSchema(field);

  return field.optional ? baseSchema.optional() : baseSchema;
};

const buildShape = (fields: readonly ISearchFieldDefinition[]): Record<string, z.ZodTypeAny> => {
  return Object.fromEntries(fields.map(field => [field.name, buildFieldSchema(field)]));
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
      const { id: _id, ...rest } = shape;

      return z.object(rest).partial();
    }
    default: {
      throw getError({
        message: `[deriveSearchDocumentSchema] Invalid schema type | valid: [select | create | update] | name: ${definition.name} | type: ${type}`,
      });
    }
  }
};

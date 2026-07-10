import { getError } from '@venizia/ignis-helpers';
// Type-only import - keeps the compiled runtime free of a hard `typesense` dependency.
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';

import type {
  ISearchCollectionDefinition,
  ISearchFieldDefinition,
  TSearchFieldType,
} from '@/connectors/search/models';
import { SearchFieldTypes, VectorDistances } from '@/connectors/search/models';

/** Wire-shaped Typesense field entry, derived from the SDK's own schema type. */
type TTypesenseField = CollectionCreateSchema['fields'][number];

const RESERVED_ID_FIELD_NAME = 'id';

/** camelCase embed model-config field -> Typesense `model_config` snake_case wire key; unmapped keys pass through. */
const EMBED_MODEL_WIRE_KEYS: Record<string, string> = {
  name: 'model_name',
  apiKey: 'api_key',
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  clientId: 'client_id',
  clientSecret: 'client_secret',
  projectId: 'project_id',
};

/** DSL field type -> Typesense wire type. */
const mapFieldType = (opts: { type: TSearchFieldType }): TTypesenseField['type'] => {
  const { type } = opts;

  switch (type) {
    case SearchFieldTypes.STRING: {
      return 'string';
    }
    case SearchFieldTypes.NUMBER: {
      return 'float';
    }
    case SearchFieldTypes.BOOLEAN: {
      return 'bool';
    }
    case SearchFieldTypes.GEOPOINT: {
      return 'geopoint';
    }
    case SearchFieldTypes.STRING_ARRAY: {
      return 'string[]';
    }
    case SearchFieldTypes.NUMBER_ARRAY: {
      return 'float[]';
    }
    case SearchFieldTypes.BOOLEAN_ARRAY: {
      return 'bool[]';
    }
    case SearchFieldTypes.VECTOR: {
      return 'float[]';
    }
    default: {
      // Unreachable under TSearchFieldType's typing - defensive against a widened caller.
      throw getError({
        message: `[compileTypesenseCollection] Unsupported search field type '${String(type)}'`,
      });
    }
  }
};

// searchable/filterable have no Typesense equivalent - every field is indexed by default, so
// both are dropped here. sortable maps to `sort`: required for strings, harmless on numbers.
const compileField = (opts: { field: ISearchFieldDefinition }): TTypesenseField => {
  const { field } = opts;

  const compiled: TTypesenseField = {
    name: field.name,
    type: mapFieldType({ type: field.type }),
  };

  if (field.facet !== undefined) {
    compiled.facet = field.facet;
  }

  if (field.optional !== undefined) {
    compiled.optional = field.optional;
  }

  if (field.sortable !== undefined) {
    compiled.sort = field.sortable;
  }

  if (field.vector) {
    const { vector } = field;

    if (vector.embed) {
      const modelConfig: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(vector.embed.model)) {
        if (value !== undefined) {
          modelConfig[EMBED_MODEL_WIRE_KEYS[key] ?? key] = value;
        }
      }

      const embed: Record<string, unknown> = {
        from: vector.embed.from,
        ['model_config']: modelConfig,
      };
      compiled.embed = embed;

      if (vector.dimensions !== undefined) {
        compiled.num_dim = vector.dimensions;
      }
    } else {
      if (vector.dimensions === undefined) {
        throw getError({
          message: `[compileTypesenseCollection] vector field '${field.name}' requires 'dimensions' (or an 'embed' config)`,
        });
      }
      compiled.num_dim = vector.dimensions;
      compiled.vec_dist = vector.distance ?? VectorDistances.COSINE;
    }
  }

  return compiled;
};

const mergeFields = (opts: {
  base: TTypesenseField[];
  override?: TTypesenseField[];
}): TTypesenseField[] => {
  const { base, override } = opts;

  if (!override || override.length === 0) {
    return base;
  }

  const overrideByName = new Map(override.map(item => [item.name, item]));

  const merged = base.map(baseField => {
    const match = overrideByName.get(baseField.name);
    return match ? { ...baseField, ...match } : baseField;
  });

  const baseNames = new Set(base.map(item => item.name));
  const appended = override.filter(item => !baseNames.has(item.name));

  return [...merged, ...appended];
};

/** engineOverrides.typesense merge order: top-level keys override last-wins; `fields` matched by name and shallow-merged, unmatched entries appended verbatim. */
const mergeOverride = (opts: {
  schema: CollectionCreateSchema;
  override: object;
}): CollectionCreateSchema => {
  const { schema, override } = opts;

  // engineOverrides.typesense is a loose `object` in the neutral DSL; cast once here to a partial wire schema.
  const { fields: overrideFields, ...restOverride } =
    override as Partial<CollectionCreateSchema> & {
      fields?: TTypesenseField[];
    };

  return {
    ...schema,
    ...restOverride,
    fields: mergeFields({ base: schema.fields, override: overrideFields }),
  };
};

/** Compiles an engine-neutral `ISearchCollectionDefinition` into a Typesense `CollectionCreateSchema`. */
export const compileTypesenseCollection = (opts: {
  definition: ISearchCollectionDefinition;
}): CollectionCreateSchema => {
  const { definition } = opts;
  const { name, fields, defaultSort, engineOverrides } = definition;

  const compiledFields = fields
    .filter(item => item.name !== RESERVED_ID_FIELD_NAME)
    .map(item => compileField({ field: item }));

  let schema: CollectionCreateSchema = {
    name,
    fields: compiledFields,
  };

  if (defaultSort !== undefined) {
    const sortField = fields.find(item => item.name === defaultSort);

    // Typesense's default_sorting_field accepts only a scalar numeric field, never string/array.
    if (sortField && sortField.type !== SearchFieldTypes.NUMBER) {
      throw getError({
        message: `[compileTypesenseCollection] Invalid defaultSort | Typesense's default_sorting_field requires a scalar numeric field (int32/int64/float) - not string, not array | name: ${name} | defaultSort: ${defaultSort} | type: ${sortField.type}`,
      });
    }

    schema.default_sorting_field = defaultSort;
  }

  const typesenseOverride = engineOverrides?.typesense;
  if (typesenseOverride) {
    schema = mergeOverride({ schema, override: typesenseOverride });
  }

  return schema;
};

import { getError } from '@venizia/ignis-helpers/core';
// Type-only import - keeps the compiled runtime free of a hard `typesense` dependency.
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';

import type {
  ISearchCollectionDefinition,
  ISearchEmbedConfig,
  ISearchFieldDefinition,
  TSearchFieldType,
} from '@/search/core/models';
import { SearchFieldTypes, VectorDistances } from '@/search/core/models';

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

/** camelCase model config -> Typesense `model_config` wire object; undefined entries are dropped. */
const buildEmbedModelConfig = (opts: {
  model: ISearchEmbedConfig['model'];
}): Record<string, unknown> => {
  const { model } = opts;
  const modelConfig: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(model)) {
    if (value === undefined) {
      continue;
    }

    modelConfig[EMBED_MODEL_WIRE_KEYS[key] ?? key] = value;
  }

  return modelConfig;
};

/** Writes the vector-specific wire keys (embed/num_dim/vec_dist) onto an already compiled field. */
const applyVectorConfig = (opts: {
  compiled: TTypesenseField;
  field: ISearchFieldDefinition;
}): void => {
  const { compiled, field } = opts;
  const { vector } = field;

  if (!vector) {
    return;
  }

  if (!vector.embed) {
    if (vector.dimensions === undefined) {
      throw getError({
        message: `[compileTypesenseCollection] vector field '${field.name}' requires 'dimensions' (or an 'embed' config)`,
      });
    }

    compiled.num_dim = vector.dimensions;
    compiled.vec_dist = vector.distance ?? VectorDistances.COSINE;
    return;
  }

  const embed: Record<string, unknown> = {
    from: vector.embed.from,
    ['model_config']: buildEmbedModelConfig({ model: vector.embed.model }),
  };
  compiled.embed = embed;

  if (vector.dimensions !== undefined) {
    compiled.num_dim = vector.dimensions;
  }
};

// searchable/filterable have no Typesense equivalent - every field is indexed by default, so both are dropped; sortable maps to `sort`, required for strings and harmless on numbers.
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

  applyVectorConfig({ compiled, field });

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

/**
 * A dotted field name resolves ONLY on a collection created with `enable_nested_fields`, and ignis
 * never emits that flag - an application sets it per collection through `engineOverrides.typesense`.
 * Since the dialect now compiles a declared dotted field rather than rejecting it outright, the
 * mismatch would otherwise surface at QUERY time as an engine rejection, far from the declaration
 * that caused it. Caught here, where the mistake is made, in the same spirit as the `defaultSort`
 * checks above.
 *
 * Deliberately NOT auto-enabled: what `enable_nested_fields` does beyond making dotted names
 * resolve is not established here, and emitting engine configuration on an unverified assumption
 * is how surprises get built in. Validate, do not paper over.
 *
 * Read off the MERGED schema, so a dotted field appended by the override is checked too, and the
 * flag is read wherever it was set. `enable_nested_fields` is declared on the SDK's
 * `CollectionCreateSchema`, so no narrowing of the loose `engineOverrides` blob is needed.
 */
const assertNestedFieldsEnabled = (opts: { schema: CollectionCreateSchema }): void => {
  const { schema } = opts;

  if (schema.enable_nested_fields === true) {
    return;
  }

  const dotted = schema.fields.find(item => item.name.includes('.'));

  if (!dotted) {
    return;
  }

  throw getError({
    message: `[compileTypesenseCollection] Nested field name requires enable_nested_fields | name: ${schema.name} | field: ${dotted.name} | a dotted name is a real Typesense field, but the collection must be created with the flag - set it via engineOverrides: { typesense: { enable_nested_fields: true } }`,
  });
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

    // A defaultSort naming an undeclared field would otherwise be forwarded verbatim and rejected by the engine - fail here with the field named, same as the type check.
    if (!sortField) {
      throw getError({
        message: `[compileTypesenseCollection] Invalid defaultSort | references a field that does not exist in the collection | name: ${name} | defaultSort: ${defaultSort}`,
      });
    }

    // Typesense's default_sorting_field accepts only a scalar numeric field, never string/array.
    if (sortField.type !== SearchFieldTypes.NUMBER) {
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

  assertNestedFieldsEnabled({ schema });

  return schema;
};

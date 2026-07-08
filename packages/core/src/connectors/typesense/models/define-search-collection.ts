import { getError } from '@venizia/ignis-helpers';

import {
    ISearchCollectionDefinition,
    ISearchEmbedConfig,
    ISearchFieldDefinition,
    SearchFieldTypes,
    TFieldFlags,
    TSearchFieldType,
    TVectorDistance,
} from './types';

/**
 * `<const N, const O>` preserve the field's name/flag literals in the return type - a widened
 * `ISearchFieldDefinition` return would break `TSearchDocument`, which needs literal types.
 */
const buildField = <
  const N extends string,
  Ty extends TSearchFieldType,
  const O extends TFieldFlags = {},
>(opts: {
  name: N;
  type: Ty;
  flags?: O;
}): { name: N; type: Ty } & O => {
  const { name, type, flags } = opts;

  return { name, type, ...flags } as { name: N; type: Ty } & O;
};

/** Curries `buildField` over a fixed field type - the shared shape behind `field.string/strings/number/numbers/boolean/booleans/geopoint`. */
const makeFieldBuilder =
  <Ty extends TSearchFieldType>(type: Ty) =>
  <const N extends string, const O extends TFieldFlags = {}>(
    name: N,
    opts?: O,
  ): { name: N; type: Ty } & O => {
    return buildField({ name, type, flags: opts });
  };

export const field = {
  id: (): { name: 'id'; type: 'string' } => {
    return { name: 'id', type: SearchFieldTypes.STRING };
  },
  string: makeFieldBuilder(SearchFieldTypes.STRING),
  strings: makeFieldBuilder(SearchFieldTypes.STRING_ARRAY),
  number: makeFieldBuilder(SearchFieldTypes.NUMBER),
  numbers: makeFieldBuilder(SearchFieldTypes.NUMBER_ARRAY),
  boolean: makeFieldBuilder(SearchFieldTypes.BOOLEAN),
  booleans: makeFieldBuilder(SearchFieldTypes.BOOLEAN_ARRAY),
  geopoint: makeFieldBuilder(SearchFieldTypes.GEOPOINT),
  /**
   * `vector`'s options are richer than `TFieldFlags` (dimensions/distance/embed, not the shared
   * searchable/filterable/facet/sortable flags), so it carries its own `O` shape rather than
   * routing through `buildField`. `O extends { optional: true } ? { optional: true } : {}`
   * mirrors `buildField`'s spread-flags behavior: `optional` only appears in the return type
   * (and at runtime) when the caller actually set it, keeping `TSearchDocument`'s
   * `Exclude<.., { optional: true }>` / `Extract<.., { optional: true }>` split working for vector fields too.
   */
  vector: <
    const N extends string,
    const O extends {
      dimensions?: number;
      distance?: TVectorDistance;
      embed?: ISearchEmbedConfig;
      optional?: boolean;
    },
  >(
    name: N,
    opts: O,
  ): { name: N; type: typeof SearchFieldTypes.VECTOR; vector: Omit<O, 'optional'> } & (O extends {
    optional: true;
  }
    ? { optional: true }
    : object) => {
    const { optional: isOptional, ...vector } = opts;
    const base = { name, type: SearchFieldTypes.VECTOR, vector };

    // A single cast is unavoidable here: the conditional-optional branch can't be proven from the
    // runtime `isOptional ? { ...base, optional: isOptional } : base` shape without widening `O`.
    return (isOptional ? { ...base, optional: isOptional } : base) as {
      name: N;
      type: typeof SearchFieldTypes.VECTOR;
      vector: Omit<O, 'optional'>;
    } & (O extends { optional: true } ? { optional: true } : object);
  },
};

/**
 * `<const T>` preserves field literals so `TSearchDocument<typeof X>` can map over them - a
 * plain `T extends ISearchCollectionDefinition` would widen `fields` and lose every literal.
 */
export const defineSearchCollection = <const T extends ISearchCollectionDefinition>(opts: T): T => {
  const { name, fields, defaultSort, synonyms, engineOverrides } = opts;

  if (!name || name.trim().length === 0) {
    throw getError({
      message: `[defineSearchCollection] Invalid name | name must be non-empty | name: ${String(name)}`,
    });
  }

  if (!fields || fields.length === 0) {
    throw getError({
      message: `[defineSearchCollection] Invalid fields | at least one field is required | name: ${name}`,
    });
  }

  const seenNames = new Set<string>();
  for (const definitionField of fields) {
    if (seenNames.has(definitionField.name)) {
      throw getError({
        message: `[defineSearchCollection] Duplicate field name | name: ${name} | field: ${definitionField.name}`,
      });
    }

    seenNames.add(definitionField.name);
  }

  const idField = fields.find(item => item.name === 'id');
  let resolvedFields: readonly ISearchFieldDefinition[] = fields;

  if (!idField) {
    resolvedFields = [field.id(), ...fields];
  } else if (idField.type !== SearchFieldTypes.STRING) {
    throw getError({
      message: `[defineSearchCollection] Invalid id field | id field must be of type string | name: ${name} | type: ${idField.type}`,
    });
  }

  // Engine-neutral rule only: defaultSort must reference a field that exists. Per-engine
  // constraints (e.g. Typesense's numeric-scalar requirement) are enforced by that engine's compiler.
  if (defaultSort) {
    const sortField = resolvedFields.find(item => item.name === defaultSort);

    if (!sortField) {
      throw getError({
        message: `[defineSearchCollection] Invalid defaultSort | field not found | name: ${name} | defaultSort: ${defaultSort}`,
      });
    }
  }

  if (synonyms) {
    const seenSynonymIds = new Set<string>();
    for (const synonym of synonyms) {
      if (seenSynonymIds.has(synonym.id)) {
        throw getError({
          message: `[defineSearchCollection] Duplicate synonym id | name: ${name} | id: ${synonym.id}`,
        });
      }

      seenSynonymIds.add(synonym.id);
    }
  }

  // The runtime result is only structurally an ISearchCollectionDefinition; the cast back to the
  // caller's literal T is deliberate - `id` is guaranteed at the type level via TSearchDocument.
  return { name, fields: resolvedFields, defaultSort, synonyms, engineOverrides } as T;
};

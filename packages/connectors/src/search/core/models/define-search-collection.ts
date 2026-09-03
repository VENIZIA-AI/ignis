import { getError } from '@venizia/ignis-helpers/core';

import type {
  ISearchCollectionDefinition,
  ISearchEmbedConfig,
  ISearchFieldDefinition,
  ISynonym,
  TFieldFlags,
  TSearchFieldType,
  TVectorDistance,
} from './types';
import { SearchFieldTypes } from './types';

/** `<const N, const O>` preserve the field's name/flag literals - a widened `ISearchFieldDefinition` return would break `TSearchDocument`, which needs literal types. */
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
  /** `vector` carries its own `O` shape (dimensions/distance/embed) instead of routing through `buildField`; the `O extends { optional: true }` conditional makes `optional` appear, in type and at runtime, only when set - keeping `TSearchDocument`'s optional split working. */
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

    // The cast is unavoidable: the conditional-optional branch can't be proven from the runtime shape without widening `O`.
    return (isOptional ? { ...base, optional: isOptional } : base) as {
      name: N;
      type: typeof SearchFieldTypes.VECTOR;
      vector: Omit<O, 'optional'>;
    } & (O extends { optional: true } ? { optional: true } : object);
  },
};

/** @throws when two synonym sets in the same collection share an id. */
const assertUniqueSynonymIds = (opts: { name: string; synonyms: readonly ISynonym[] }): void => {
  const { name, synonyms } = opts;
  const seenSynonymIds = new Set<string>();

  for (const synonym of synonyms) {
    if (seenSynonymIds.has(synonym.id)) {
      throw getError({
        message: `[defineSearchCollection] Duplicate synonym id | name: ${name} | id: ${synonym.id}`,
      });
    }

    seenSynonymIds.add(synonym.id);
  }
};

/** `<const T>` preserves field literals so `TSearchDocument<typeof X>` can map over them - a plain `T extends ISearchCollectionDefinition` would widen `fields` and lose every literal. */
export const defineSearchCollection = <const T extends ISearchCollectionDefinition>(opts: T): T => {
  const { name, fields, defaultSort, defaultQueryBy, synonyms, engineOverrides } = opts;

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

  // Engine-neutral rule only: defaultSort must reference an existing field; per-engine constraints (Typesense's numeric-scalar requirement) belong to that engine's compiler.
  if (defaultSort) {
    const sortField = resolvedFields.find(item => item.name === defaultSort);

    if (!sortField) {
      throw getError({
        message: `[defineSearchCollection] Invalid defaultSort | field not found | name: ${name} | defaultSort: ${defaultSort}`,
      });
    }
  }

  if (defaultQueryBy) {
    for (const queryByFieldName of defaultQueryBy) {
      const queryByField = resolvedFields.find(item => item.name === queryByFieldName);

      if (!queryByField) {
        throw getError({
          message: `[defineSearchCollection] Invalid defaultQueryBy | field not found | name: ${name} | field: ${queryByFieldName}`,
        });
      }

      if (
        queryByField.type !== SearchFieldTypes.STRING &&
        queryByField.type !== SearchFieldTypes.STRING_ARRAY
      ) {
        throw getError({
          message: `[defineSearchCollection] Invalid defaultQueryBy | full-text search matches text fields only (string, string[]) | name: ${name} | field: ${queryByFieldName} | type: ${queryByField.type}`,
        });
      }
    }
  }

  if (synonyms) {
    assertUniqueSynonymIds({ name, synonyms });
  }

  // The runtime result is only structurally an ISearchCollectionDefinition; the cast back to the caller's literal T is deliberate - `id` is guaranteed at the type level via TSearchDocument.
  return {
    name,
    fields: resolvedFields,
    defaultSort,
    defaultQueryBy,
    synonyms,
    engineOverrides,
  } as T;
};

import { getError } from '@venizia/ignis-helpers';

import {
  ISearchCollectionDefinition,
  ISearchFieldDefinition,
  SearchFieldTypes,
  TFieldFlags,
  TSearchFieldType,
} from './types';

/**
 * `<const N, const O>` preserve the field's name/flag literals in the return type - a widened
 * `ISearchFieldDefinition` return would break `TInferSearchDocument`, which needs literal types.
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

export const field = {
  id: (): { name: 'id'; type: 'string' } => {
    return { name: 'id', type: SearchFieldTypes.STRING };
  },
  string: <const N extends string, const O extends TFieldFlags = {}>(
    name: N,
    opts?: O,
  ): { name: N; type: 'string' } & O => {
    return buildField({ name, type: SearchFieldTypes.STRING, flags: opts });
  },
  strings: <const N extends string, const O extends TFieldFlags = {}>(
    name: N,
    opts?: O,
  ): { name: N; type: 'string[]' } & O => {
    return buildField({ name, type: SearchFieldTypes.STRING_ARRAY, flags: opts });
  },
  number: <const N extends string, const O extends TFieldFlags = {}>(
    name: N,
    opts?: O,
  ): { name: N; type: 'number' } & O => {
    return buildField({ name, type: SearchFieldTypes.NUMBER, flags: opts });
  },
  numbers: <const N extends string, const O extends TFieldFlags = {}>(
    name: N,
    opts?: O,
  ): { name: N; type: 'number[]' } & O => {
    return buildField({ name, type: SearchFieldTypes.NUMBER_ARRAY, flags: opts });
  },
  boolean: <const N extends string, const O extends TFieldFlags = {}>(
    name: N,
    opts?: O,
  ): { name: N; type: 'boolean' } & O => {
    return buildField({ name, type: SearchFieldTypes.BOOLEAN, flags: opts });
  },
  booleans: <const N extends string, const O extends TFieldFlags = {}>(
    name: N,
    opts?: O,
  ): { name: N; type: 'boolean[]' } & O => {
    return buildField({ name, type: SearchFieldTypes.BOOLEAN_ARRAY, flags: opts });
  },
  geopoint: <const N extends string, const O extends TFieldFlags = {}>(
    name: N,
    opts?: O,
  ): { name: N; type: 'geopoint' } & O => {
    return buildField({ name, type: SearchFieldTypes.GEOPOINT, flags: opts });
  },
};

/**
 * `<const T>` preserves field literals so `TInferSearchDocument<typeof X>` can map over them - a
 * plain `T extends ISearchCollectionDefinition` would widen `fields` and lose every literal.
 */
export const defineSearchCollection = <const T extends ISearchCollectionDefinition>(opts: T): T => {
  const { name, fields, defaultSort, engineOverrides } = opts;

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

  // The runtime result is only structurally an ISearchCollectionDefinition; the cast back to the
  // caller's literal T is deliberate - `id` is guaranteed at the type level via TInferSearchDocument.
  return { name, fields: resolvedFields, defaultSort, engineOverrides } as T;
};

import type { TSearchFieldType } from '../constants';
import type { ISearchCollectionDefinition } from './collection';

/** Maps a DSL field-type literal to its TypeScript runtime type - the scalar/array counterpart of `TSearchFieldType`. */
export type TSearchFieldTsType<T extends TSearchFieldType> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'geopoint'
        ? [number, number]
        : T extends 'string[]'
          ? string[]
          : T extends 'number[]'
            ? number[]
            : T extends 'boolean[]'
              ? boolean[]
              : T extends 'vector'
                ? number[]
                : never;

/** Compile-time document shape for a `defineSearchCollection` literal. Uses `Exclude<..., { optional: true }>`, not `Extract<..., { optional?: false }>` - the latter is a TS weak type and rejects fields with no `optional` key. A `vector.embed` field is server auto-embedded, so it is omitted entirely. */
export type TSearchDocument<T extends ISearchCollectionDefinition> = { id: string } & {
  [
    F in Exclude<T['fields'][number], { optional: true }> as F['name'] extends 'id'
      ? never
      : F extends { vector: { embed: object } }
        ? never
        : F['name']
  ]: TSearchFieldTsType<F['type']>;
} & {
  [
    F in Extract<T['fields'][number], { optional: true }> as F['name'] extends 'id'
      ? never
      : F extends { vector: { embed: object } }
        ? never
        : F['name']
  ]?: TSearchFieldTsType<F['type']>;
};

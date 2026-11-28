/**
 * Whether an enricher's column option is on. `undefined` is the third state: the option key was left out entirely,
 * so the enricher default decides. An options object that omits only `enable` is opted in: `{ enable?: true }` alone
 * would resolve it to `undefined` here, because weak-type detection rejects a member with no `enable`.
 */
export type TIsEnabled<T> = T extends { enable: false }
  ? false
  : T extends object
    ? true
    : undefined;

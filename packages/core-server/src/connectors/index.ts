// Alias barrel - the connectors moved to `@venizia/ignis-connectors`. Kept so the root of
// `@venizia/ignis` re-exports the same surface it did before the move: the pre-move root barrel
// re-exported `./postgres` only, never the neutral relational/search cores, so re-exporting the
// package root here instead would both drop postgres's names and collide on shared type names
// (`TTableObject`, `TRelationConfig`, ...) that postgres redeclares rather than re-exports.
export * from '@venizia/ignis-connectors/postgres';

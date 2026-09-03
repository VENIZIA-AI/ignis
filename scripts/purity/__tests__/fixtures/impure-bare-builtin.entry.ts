import { readFileSync } from 'fs';

// Same leak as impure-builtin.entry.ts, but unprefixed - Bun's metafile records the specifier
// exactly as written, with no `node:` anywhere for a matcher keyed on that prefix to find.
export const readSelf = (opts: { path: string }): string => {
  return readFileSync(opts.path, 'utf8');
};

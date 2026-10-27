import { readFileSync } from 'node:fs';

export const readSelf = (opts: { path: string }): string => {
  return readFileSync(opts.path, 'utf8');
};

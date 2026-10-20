import path from 'node:path';

/** The package directory, found from this file - `process.cwd()` is wherever `bun test` started. */
export const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

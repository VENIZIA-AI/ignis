import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A browser that only throws an `ApplicationError` must not ship the `reflect-metadata` polyfill (44 KB
 * minified, a third of a minimal `HttpDataSource` bundle): a module that calls `Reflect.*Metadata` imports
 * it itself, so the package entry does not. A bundler decides what to keep, and Bun and Vite disagree on a
 * side-effect import, so the guard reads the source: the import is where it belongs, and only there.
 */
const read = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8');

const IMPORT_POLYFILL = /^import 'reflect-metadata';$/m;

describe('the package entry stays free of the reflect-metadata polyfill', () => {
  test('src/index.ts does not import it', () => {
    expect(IMPORT_POLYFILL.test(read('index.ts'))).toBe(false);
  });

  test('the registry, which calls Reflect.*Metadata, imports it itself', () => {
    expect(IMPORT_POLYFILL.test(read('modules/registry/registry.ts'))).toBe(true);
  });
});

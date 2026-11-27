import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * A browser bundle that reads HTTP methods from the built `common` entry carries the methods and nothing beside them.
 * It reads the build: there a static member is a `static` block, which a bundler keeps with its whole module, and
 * the sources alone do not show that. Skipped in a release job that does not build the helpers.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const COMMON = join(REPO_ROOT, 'packages/helpers/dist/esm/common/index.js');
/** The measured size is about 140 bytes. */
const CEILING_BYTES = 512;

const bundle = async () => {
  const folder = mkdtempSync(join(tmpdir(), 'http-weight-'));
  const entry = join(folder, 'front.js');

  try {
    writeFileSync(entry, `import { HTTP } from '${COMMON}';\nconsole.log(HTTP.Methods.GET);\n`);
    const built = await Bun.build({ entrypoints: [entry], target: 'browser', minify: true });
    const text = await built.outputs[0].text();

    return text;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
};

describe('a bundle that reads HTTP.Methods', () => {
  test.skipIf(!existsSync(COMMON))(
    `stays under ${CEILING_BYTES} bytes, with no other group and no error class`,
    async () => {
      const text = await bundle();
      console.log(`HTTP.Methods only: ${Buffer.byteLength(text)} of ${CEILING_BYTES} bytes`);

      expect(Buffer.byteLength(text)).toBeLessThan(CEILING_BYTES);

      for (const left of ['application/json', 'content-type', 'statusCode', 'attachment']) {
        expect(text.includes(left), left).toBe(false);
      }
    },
  );
});

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

/**
 * A weight gate, not a purity gate. zod IS browser-pure, so `make purity-kernel` says nothing about
 * it - it is simply 423 KB, and it reached every consumer of `Container` through one import.
 *
 * The chain was: `Container` -> `registry` -> the `mixins` barrel -> the controller mixin ->
 * `base/controllers/common/constants.ts`, which called `z.object()` at module load for two request
 * schemas. The mixin wanted `ControllerTransports` from that file, a four-line const class.
 *
 * Nothing in a type system stops someone re-adding that import, so the measurement is the guard.
 */
// Relative to the package root, not to this file: `import.meta` is unavailable in the CJS half of
// the dual build, and this suite is compiled with the rest of the package.
const CONTAINER_ENTRY = join(process.cwd(), 'src/helpers/inversion/container.ts');
const METADATA_ENTRY = join(process.cwd(), 'src/metadata.ts');

/** Roughly double today's measurement - loose enough for ordinary growth, far under the 437 KB a re-merged zod import costs. */
const CEILING_BYTES = 120 * 1024;

const bundle = async (entrypoint: string) => {
  const built = await Bun.build({ entrypoints: [entrypoint], target: 'browser', minify: true });

  if (!built.success) {
    throw new Error(
      `[browser-weight] Bundle failed | ${entrypoint} | ${built.logs.map(String).join(' | ')}`,
    );
  }

  const [output] = built.outputs;
  return { bytes: (await output.arrayBuffer()).byteLength, text: await output.text() };
};

describe('importing Container alone stays cheap in a browser bundle', () => {
  test(`it bundles under ${CEILING_BYTES / 1024} KB minified`, async () => {
    const { bytes } = await bundle(CONTAINER_ENTRY);

    // Named in the message: a bare "expected X to be less than Y" sends the reader hunting.
    expect(
      bytes,
      `Container bundles to ${Math.round(bytes / 1024)} KB. Something on its import path now pulls a heavy dependency - check for a new import in base/controllers/common/constants.ts or in the mixins barrel.`,
    ).toBeLessThan(CEILING_BYTES);
  });

  test('no zod reaches it', async () => {
    const { text } = await bundle(CONTAINER_ENTRY);

    // A boolean, not the text: asserting on the string prints the whole minified bundle into the
    // failure output, which buries the one line that says what went wrong.
    expect(text.includes('ZodObject'), 'zod reached the container bundle').toBe(false);
  });
});

/**
 * The whole point of the sub-path. The ROOT barrel is 161 KB gzipped and correctly so - it carries
 * the REST surface. `./metadata` exists for a consumer that only registers and resolves classes, and
 * the boundary is worth nothing unless it is measured.
 */
describe('the metadata entry stays free of the transport surface', () => {
  test(`it bundles under ${CEILING_BYTES / 1024} KB minified`, async () => {
    const { bytes } = await bundle(METADATA_ENTRY);

    expect(
      bytes,
      `kernel/metadata bundles to ${Math.round(bytes / 1024)} KB. Something it exports now reaches a heavy dependency - check what src/metadata.ts added.`,
    ).toBeLessThan(CEILING_BYTES);
  });

  test('no zod reaches it', async () => {
    const { text } = await bundle(METADATA_ENTRY);

    expect(text.includes('ZodObject'), 'zod reached the metadata entry').toBe(false);
  });
});

/**
 * A surface test, not a weight one, kept here because it guards the same boundary.
 *
 * `CoreBindings` is one application's dictionary, not the grammar of a binding key. Another
 * framework in this house ships a class of the same name whose `APPLICATION_INSTANCE` is a different
 * string, so shipping ours beside the stereotypes puts the two one import away from each other -
 * bind under one, resolve under the other, and nothing fails until run time.
 */
describe('the metadata entry carries mechanism, not one application vocabulary', () => {
  test('CoreBindings is not exported from it', async () => {
    const entry = await import('../../metadata.js');

    expect(Object.keys(entry)).not.toContain('CoreBindings');
  });

  /** The namespaces ARE the grammar, and they must stay. */
  test('the binding namespaces are', async () => {
    const entry = await import('../../metadata.js');

    expect(Object.keys(entry)).toContain('BindingNamespaces');
    expect(Object.keys(entry)).toContain('ArtifactNamespaces');
  });
});

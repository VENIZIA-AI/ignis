import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

/**
 * A weight gate, not a purity gate: zod is browser-PURE, so `make purity-kernel` had nothing to say
 * while `Container` -> `registry` -> the `mixins` barrel -> the controller mixin ->
 * `base/controllers/common/constants.ts` cost every consumer 423 KB, for a four-line const class.
 * Nothing in a type system stops that import coming back, so the measurement is the guard.
 */
// Relative to the package root: `import.meta` is unavailable in the CJS half of the dual build.
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

    // A boolean, not the text: asserting on the string prints the whole minified bundle on failure.
    expect(text.includes('ZodObject'), 'zod reached the container bundle').toBe(false);
  });
});

/** The root barrel is 161 KB gzipped and right to be - it carries REST. `./metadata` is the boundary for consumers that never serve HTTP, and a boundary nobody measures is not one. */
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
 * A surface test, kept here because it guards the same boundary. `CoreBindings` is one application's
 * dictionary, not the grammar of a key, and a sibling framework ships a class of the same name whose
 * `APPLICATION_INSTANCE` differs - bind under one, resolve under the other, fails only at run time.
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

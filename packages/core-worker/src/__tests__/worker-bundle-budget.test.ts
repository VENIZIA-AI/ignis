import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

/**
 * A weight gate, not a purity gate: zod is browser-PURE, so `make purity-core-worker` has nothing to say
 * about it. `WorkerApplication` extends the kernel's `RestApplication`, which used to build its two
 * routers with `new OpenAPIHono` - loading `@hono/zod-openapi`, and with it zod (about 394 KB minified) and
 * zod-to-openapi (about 33 KB), into a worker that declares no validated or OpenAPI route. Nothing in a
 * type system stops that import coming back, so the measurement is the guard.
 *
 * Bundled with `bun build`'s browser target from `src`, against the kernel's built `dist` (rule B-05:
 * `make kernel` first). The fixtures live in `fixtures/`.
 */
const FIXTURES = join(process.cwd(), 'src/__tests__/fixtures');
const MINIMAL_WORKER = join(FIXTURES, 'minimal-worker.probe.ts');
const CONTROLLER_WORKER = join(FIXTURES, 'controller-worker.probe.ts');

/**
 * Gzip ceiling of the minimal worker. Measured 2026-11-07 (Bun 1.4.4, minified): 136,953 B raw, 44,828 B
 * gzip; before the routers became plain `Hono` it was 568,535 B raw, 145,890 B gzip. The ceiling is about
 * 25% over today's number, far under what zod brings back.
 */
const MINIMAL_GZIP_CEILING_BYTES = 56 * 1024;
const MINIMAL_RAW_CEILING_BYTES = 170 * 1024;

const NODE_MODULES_PACKAGE = /node_modules\/(?:\.bun\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/;

/** The heavy dependencies a bundle must not carry, named by the package a bundled input resolves into. */
const OPENAPI_PACKAGES = new Set(['zod', '@asteasolutions/zod-to-openapi', '@hono/zod-openapi']);

const bundle = async (entrypoint: string) => {
  const built = await Bun.build({
    entrypoints: [entrypoint],
    target: 'browser',
    minify: true,
    metafile: true,
  });

  if (!built.success) {
    throw new Error(
      `[worker-bundle-budget] Bundle failed | ${entrypoint} | ${built.logs.map(String).join(' | ')}`,
    );
  }

  const [output] = built.outputs;

  if (!output) {
    throw new Error(`[worker-bundle-budget] The bundle produced no output | ${entrypoint}`);
  }

  const buffer = await output.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const packages = new Set<string>();

  for (const input of Object.keys(built.metafile?.inputs ?? {})) {
    const match = NODE_MODULES_PACKAGE.exec(input);

    if (match?.[1]) {
      packages.add(match[1]);
    }
  }

  return {
    raw: bytes.byteLength,
    gzip: Bun.gzipSync(bytes, { level: 9 }).length,
    packages,
  };
};

const openApiPackagesOf = (packages: Set<string>): string[] => {
  return [...packages].filter((name) => OPENAPI_PACKAGES.has(name)).sort();
};

describe('a worker that uses no validation and no OpenAPI', () => {
  test('bundles neither zod nor zod-to-openapi nor @hono/zod-openapi', async () => {
    const result = await bundle(MINIMAL_WORKER);

    // Names the packages: a bare "expected [] received [...]" sends the reader hunting.
    expect(
      openApiPackagesOf(result.packages),
      'The minimal worker bundles the OpenAPI layer. Look for a new import of @hono/zod-openapi, or of a module that has one, on the path from WorkerApplication through RestApplication.',
    ).toEqual([]);
  });

  test(`stays under ${MINIMAL_GZIP_CEILING_BYTES / 1024} KB gzip and ${MINIMAL_RAW_CEILING_BYTES / 1024} KB raw`, async () => {
    const result = await bundle(MINIMAL_WORKER);

    expect(
      result.gzip,
      `The minimal worker is ${result.gzip} B gzip (${result.raw} B raw).`,
    ).toBeLessThanOrEqual(MINIMAL_GZIP_CEILING_BYTES);
    expect(
      result.raw,
      `The minimal worker is ${result.raw} B raw (${result.gzip} B gzip).`,
    ).toBeLessThanOrEqual(MINIMAL_RAW_CEILING_BYTES);
  });
});

/** The control: with a REST controller the validation and OpenAPI layer must come along, and its check must see it. */
describe('a worker with a REST controller', () => {
  test('still carries the OpenAPI layer', async () => {
    const result = await bundle(CONTROLLER_WORKER);

    expect(openApiPackagesOf(result.packages)).toEqual([
      '@asteasolutions/zod-to-openapi',
      '@hono/zod-openapi',
      'zod',
    ]);
  });
});

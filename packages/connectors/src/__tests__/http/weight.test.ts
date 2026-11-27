import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

/**
 * The sub-path exists so a consumer that talks HTTP never installs or bundles a SQL stack. The root
 * barrel is 144 KB gzipped and right to be - it carries drizzle and the schema layer. A boundary
 * nobody measures is not one.
 */
const HTTP_ENTRY = join(process.cwd(), 'src/http/index.ts');
/**
 * The measured size is 67,684 bytes: the data source sends through `NativeFetcher`, whose pipeline (status check, retry,
 * hooks, the error classes) is browser-pure and ships with it; the guard's `UrlPolicy` and duration units stay out. The
 * SQL stack was 140 KB more. The 384 bytes above 66 KB hold what the measured size needs, the refusal of the removed hook
 * settings included, and leave 284 free.
 */
const CEILING_BYTES = 66 * 1024 + 384;

const bundle = async () => {
  const built = await Bun.build({ entrypoints: [HTTP_ENTRY], target: 'browser', minify: true });

  if (!built.success) {
    throw new Error(`[http-weight] Bundle failed | ${built.logs.map(String).join(' | ')}`);
  }

  return built.outputs[0].text();
};

describe('the http connector stays free of the SQL stack', () => {
  test(`it bundles under ${CEILING_BYTES} bytes minified`, async () => {
    const text = await bundle();
    // Printed so a CI log shows how close the bundle is to its ceiling.
    console.log(`connectors/http: ${Buffer.byteLength(text)} of ${CEILING_BYTES} bytes`);

    expect(
      Buffer.byteLength(text),
      `connectors/http bundles to ${Math.round(Buffer.byteLength(text) / 1024)} KB. Something it exports now reaches the relational or search side - check src/http/.`,
    ).toBeLessThan(CEILING_BYTES);
  });

  const forbiddens = [
    'drizzle',
    'ZodObject',
    // The `reflect-metadata` polyfill, and the node logger provider.
    'getOwnMetadataKeys',
    'winston',
    // The axios fetcher and anything of node's.
    'axios',
    'node:',
  ] as const;

  for (const forbidden of forbiddens) {
    test(`no ${forbidden} reaches it`, async () => {
      const text = await bundle();

      expect(text.includes(forbidden), `${forbidden} reached connectors/http`).toBe(false);
    });
  }
});

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

/**
 * The sub-path exists so a consumer that talks HTTP never installs or bundles a SQL stack. The root
 * barrel is 144 KB gzipped and right to be - it carries drizzle and the schema layer. A boundary
 * nobody measures is not one.
 */
const HTTP_ENTRY = join(process.cwd(), 'src/http/index.ts');
/** The measured size is about 28 KB; the 60 KB it was carried the `reflect-metadata` polyfill, the DI registry and the node transport. */
const CEILING_BYTES = 45 * 1024;

const bundle = async () => {
  const built = await Bun.build({ entrypoints: [HTTP_ENTRY], target: 'browser', minify: true });

  if (!built.success) {
    throw new Error(`[http-weight] Bundle failed | ${built.logs.map(String).join(' | ')}`);
  }

  return built.outputs[0].text();
};

describe('the http connector stays free of the SQL stack', () => {
  test(`it bundles under ${CEILING_BYTES / 1024} KB minified`, async () => {
    const text = await bundle();

    expect(
      Buffer.byteLength(text),
      `connectors/http bundles to ${Math.round(Buffer.byteLength(text) / 1024)} KB. Something it exports now reaches the relational or search side - check src/http/.`,
    ).toBeLessThan(CEILING_BYTES);
  });

  const forbiddens = [
    'drizzle',
    'ZodObject',
    // The `reflect-metadata` polyfill, and the node transport's log line.
    'getOwnMetadataKeys',
    'Creating new network request worker instance',
  ] as const;

  for (const forbidden of forbiddens) {
    test(`no ${forbidden} reaches it`, async () => {
      const text = await bundle();

      expect(text.includes(forbidden), `${forbidden} reached connectors/http`).toBe(false);
    });
  }
});

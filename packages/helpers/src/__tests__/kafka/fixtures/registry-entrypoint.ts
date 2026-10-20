import { ConfluentSchemaRegistry } from '@platformatic/kafka';

const SCHEMA_ID = 1;

/** Declaring draft-06 routes the schema to the ajv instance the constructor fed the draft-06 meta schema to, so compiling it exercises that meta schema rather than only the import. */
const DRAFT_06_SCHEMA = {
  $schema: 'http://json-schema.org/draft-06/schema#',
  type: 'object',
  properties: { name: { type: 'string' } },
};

const probe = async (): Promise<void> => {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: () => Response.json({ schemaType: 'JSON', schema: JSON.stringify(DRAFT_06_SCHEMA) }),
  });

  try {
    const registry = new ConfluentSchemaRegistry({ url: `http://127.0.0.1:${server.port}` });

    const fetched = await new Promise<string>(resolve => {
      registry
        .fetchSchema(SCHEMA_ID, error => {
          resolve(error ? `fetch-failed: ${error.message}` : 'ok');
        })
        .catch((error: unknown) => {
          resolve(`fetch-threw: ${error instanceof Error ? error.message : String(error)}`);
        });
    });

    if (fetched !== 'ok' || !registry.get(SCHEMA_ID)) {
      console.log(`bad | fetch: ${fetched}`);
      return;
    }

    console.log('ok');
  } finally {
    await server.stop(true);
  }
};

probe().catch(error => {
  console.log(`bad | ${error instanceof Error ? error.message : String(error)}`);
});

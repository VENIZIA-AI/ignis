// Boot test: runs the application's own boot (every binding, every controller injection) without a
// port, a database or a network. A datasource added later is skipped unless you name it in `keepDataSources`.
import { describe, expect, test } from 'bun:test';
import { assertApplicationBoots } from '@venizia/ignis/testing';
import { application } from '#src/application';

describe('{{app}} boot', () => {
  test('boots and mounts its routes', async () => {
    const booted = await assertApplicationBoots(application);

    // The root router has no base path yet: `start()` mounts it under `/api`.
    const response = await booted.getRootRouter().request('/hello');

    expect(response.status).toBe(200);
  });
});

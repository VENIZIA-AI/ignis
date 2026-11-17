import { RouterFactories } from '@/base/applications/router-factory';

/**
 * Run by `router-factory.test.ts` in a fresh process, where nothing else has registered the OpenAPI
 * layer: prints whether it is registered before and after the REST controller module loads.
 */
const before = RouterFactories.isOpenApiRegistered();

await import('@/base/controllers/rest/abstract');

const after = RouterFactories.isOpenApiRegistered();

console.log(JSON.stringify({ before, after }));

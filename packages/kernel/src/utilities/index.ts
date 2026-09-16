// Zod-free by design: this barrel must stay reachable from a browser bundle. The OpenAPI schema
// builders that used to live here are under `base/controllers/common/`, with the REST surface.
export * from './error.utility';

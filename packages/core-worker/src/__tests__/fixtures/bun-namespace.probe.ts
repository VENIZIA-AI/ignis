/**
 * Compiled by `browser-purity.test.ts` against `tsconfig.build.json`, where it must FAIL. It lives
 * under `__tests__` so the production build never sees it and `bun test` never runs it.
 */
export const bunEnvironmentName: string | undefined = Bun.env.NODE_ENV;

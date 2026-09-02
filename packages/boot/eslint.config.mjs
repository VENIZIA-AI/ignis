import { eslintConfigs } from '@venizia/dev-configs';

// Scanner fixtures are text the generator reads, not code this package compiles - they import
// stereotypes from packages boot does not depend on, so neither tsc nor eslint may resolve them.
export default [{ ignores: ['src/__tests__/fixtures/artifacts/**'] }, ...eslintConfigs];

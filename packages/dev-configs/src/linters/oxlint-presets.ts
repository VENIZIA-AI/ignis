// The entry of `@venizia/dev-configs/linters/oxlint`: everything an oxlint config needs and nothing that
// imports ESLint at runtime, so evaluating the config does not load `eslint` or `typescript-eslint`.
// The rule classes import ESLint types only, which the build erases.
export * from './browser';
export * from './ignore';
export * from './oxlint';
export { ReactOxlintConfigs } from './react-oxlint';
export * from './rules';

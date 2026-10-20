// The entry of `@venizia/dev-configs/linters/oxlint`: the oxlint presets and nothing that imports ESLint,
// so evaluating an oxlint config does not load `eslint` or `typescript-eslint`.
export * from './browser';
export * from './oxlint';
export { ReactOxlintConfigs } from './react-oxlint';

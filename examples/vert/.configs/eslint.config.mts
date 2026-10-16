import { namingConventionConfigs } from '@venizia/dev-configs/linters';

// oxlint (.configs/oxlint.config.mts) runs every other rule; ESLint keeps the one oxlint has no port of yet.
export default [{ ignores: ['scripts/'] }, ...namingConventionConfigs];

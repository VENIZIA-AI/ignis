import { houseConfigs } from '@venizia/dev-configs/linters';

// oxlint runs every other rule; ESLint runs what oxlint cannot: the naming convention and the house rules.
// The shared theme folder belongs to VULCAN: change the canonical copy there, never this one.
export default [{ ignores: ['site/.vitepress/theme/shared/**'] }, ...houseConfigs];

export interface IPurityEntry {
  label: string;
  package: string;
  entry: string;
}

export const PURITY_MANIFEST: IPurityEntry[] = [
  { label: 'inversion', package: 'inversion', entry: 'packages/inversion/dist/esm/index.js' },
  { label: 'inversion-cjs', package: 'inversion', entry: 'packages/inversion/dist/cjs/index.js' },
  { label: 'filter', package: 'filter', entry: 'packages/filter/dist/esm/index.js' },
  { label: 'filter-cjs', package: 'filter', entry: 'packages/filter/dist/cjs/index.js' },
  { label: 'helpers-core', package: 'helpers', entry: 'packages/helpers/dist/core.js' },
  { label: 'helpers-common', package: 'helpers', entry: 'packages/helpers/dist/common/index.js' },
];

import { MetadataKeys as _MetadataKeys } from '@venizia/ignis-inversion';

export const MetadataKeys = Object.assign({}, _MetadataKeys, {
  CONTROLLER: Symbol.for('ignis:controller'),
  CONTROLLER_ROUTE: Symbol.for('ignis:controller:route'),

  MODEL: Symbol.for('ignis:model'),
  DATASOURCE: Symbol.for('ignis:datasource'),
  REPOSITORY: Symbol.for('ignis:repository'),
});

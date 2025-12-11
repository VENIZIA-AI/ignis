import { MetadataKeys as _MetadataKeys } from '@venizia/ignis-inversion';

export const MetadataKeys = Object.assign({}, _MetadataKeys, {
  // Controller metadata
  CONTROLLER: Symbol.for('ignis:controller'),
  CONTROLLER_ROUTE: Symbol.for('ignis:controller:route'),

  // Model metadata
  MODEL: Symbol.for('ignis:model'),
  DATASOURCE: Symbol.for('ignis:datasource'),
  REPOSITORY: Symbol.for('ignis:repository'),

  // Injection metadata
  INJECTABLE: Symbol.for('ignis:injectable'),
});

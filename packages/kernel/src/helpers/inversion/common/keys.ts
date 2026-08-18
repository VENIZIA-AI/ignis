import { MetadataKeys as _MetadataKeys } from '@venizia/ignis-inversion';

export const MetadataKeys = Object.assign({}, _MetadataKeys, {
  CONTROLLER: Symbol.for('ignis:controller'),
  CONTROLLER_REST_ROUTE: Symbol.for('ignis:controller:rest:route'),
  CONTROLLER_GRPC_ROUTE: Symbol.for('ignis:controller:grpc:route'),

  MODEL: Symbol.for('ignis:model'),
  DATASOURCE: Symbol.for('ignis:datasource'),
  REPOSITORY: Symbol.for('ignis:repository'),
});

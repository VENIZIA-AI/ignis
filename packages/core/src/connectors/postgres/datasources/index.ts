export * from './abstract';
export * from './base';
export * from './common';

// Compatibility aliases - same classes, historical public names kept for existing apps.
export { AbstractRelationalDataSource as AbstractPostgresDataSource } from './abstract';
export {
  BaseRelationalDataSource as BasePostgresDataSource,
  BaseRelationalDataSource as BaseDataSource,
} from './base';

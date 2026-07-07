export * from './base';
export * from './readable';
export * from './persistable';
export * from './default';
export * from './soft-deletable';

// Compatibility aliases - same classes, historical public names kept for existing apps.
export { RelationalBaseRepository as PostgresBaseRepository } from './base';
export { ReadableRelationalRepository as ReadableRepository } from './readable';
export { PersistableRelationalRepository as PersistableRepository } from './persistable';
export { DefaultRelationalRepository as DefaultCRUDRepository } from './default';
export { SoftDeletableRelationalRepository as SoftDeletableRepository } from './soft-deletable';
